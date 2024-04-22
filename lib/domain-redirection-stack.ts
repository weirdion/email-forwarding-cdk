import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { ARecord, HostedZone, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import * as path from "path";
import { DomainMapConfig } from "./domain-map-config";

interface DomainRedirectionProps extends StackProps {
  domainMapConfig: DomainMapConfig[];
}

export class DomainRedirectionStack extends Stack {

  private s3OriginBucket: Bucket;
  public readonly domainMapSSM: StringParameter;


  constructor(scope: Construct, id: string, props: DomainRedirectionProps) {
    super(scope, id, props);

    this.s3OriginBucket = new Bucket(this, 'StubOriginBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
    });

    this.domainMapSSM = new StringParameter(this, 'DomainMapConfig', {
      parameterName: 'DomainMapConfig',
      simpleName: true,
      stringValue: JSON.stringify(props.domainMapConfig),
    });
    new CfnOutput(this, 'DomainMapParameterName', { value: this.domainMapSSM.parameterName });


    const redirectLambda = new cf.experimental.EdgeFunction(this, 'DomainRedirect', {
      code: Code.fromAsset(path.join(__dirname, '../resources/lambda')),
      handler: 'domain_redirect.handler',
      runtime: Runtime.PYTHON_3_11,
    });
    this.domainMapSSM.grantRead(redirectLambda);

    props.domainMapConfig.map((domainName) => {
      console.log(`Parsing domain config: ${domainName.hostZoneName}`);
      const sourceDomains: string[] = []
      const subDomains: string[] = []

      domainName.redirects.map((redirect) => {
        subDomains.push(redirect.subDomain === '.' ? '' : redirect.subDomain)
        sourceDomains.push(redirect.subDomain === '.' ? domainName.hostZoneName : `${redirect.subDomain}.${domainName.hostZoneName}`)
      });
      const identifier = domainName.hostZoneName.replace(/[^a-z0-9]/gi, '');
      const hostedZone = HostedZone.fromHostedZoneAttributes(this, `${identifier}HostedZone`, {
        hostedZoneId: domainName.hostedZoneId,
        zoneName: domainName.hostZoneName
      });
      const distribution = this.createDistribution(
        identifier,
        sourceDomains,
        redirectLambda,
        hostedZone,
      );

      for (const subDomain of subDomains) {
        const aRecord = new ARecord(this, `${identifier}${subDomain}ARecord`, {
          comment: 'Alias record to CloudFront distribution',
          zone: hostedZone,
          recordName: subDomain,
          target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
          ttl: Duration.days(1),
        });
      }
    });
  }

  createDistribution(identifier: string, sourceDomains: string[], redirectLambda: cf.experimental.EdgeFunction, hostedZone: IHostedZone,
  ): cf.Distribution {
    console.log(`sourceDomains: ${sourceDomains}`)
    const distribution = new cf.Distribution(this, `${identifier}Distribution`, {
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      httpVersion: cf.HttpVersion.HTTP2,
      sslSupportMethod: cf.SSLMethod.SNI,
      defaultBehavior: {
        origin: new S3Origin(this.s3OriginBucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cf.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
        edgeLambdas: [{
          eventType: cf.LambdaEdgeEventType.VIEWER_REQUEST,
          functionVersion: redirectLambda.currentVersion,
        }],
      },
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021,
      domainNames: sourceDomains,
      certificate: this.getAcmCertificateArn(identifier, hostedZone, sourceDomains),
      enableLogging: false,
    });

    new CfnOutput(this, identifier, { value: distribution.domainName });
    return distribution;
  }

  getAcmCertificateArn(identifier: string, hostedZone: IHostedZone, sourceDomains: string[]) {
    return new Certificate(this, `${identifier}Certificate`, {
      domainName: `${hostedZone.zoneName}`,
      subjectAlternativeNames: sourceDomains.filter(domain => domain !== hostedZone.zoneName),
      certificateName: `${hostedZone.zoneName} Certificate`,
      validation: CertificateValidation.fromDns(hostedZone),
    });
  }
}
