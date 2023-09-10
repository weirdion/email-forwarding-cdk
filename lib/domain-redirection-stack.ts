import {CfnOutput, Stack, StackProps} from "aws-cdk-lib";
import {DomainMapConfig} from "./domain-map-config";
import {Construct} from "constructs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import {Distribution} from "aws-cdk-lib/aws-cloudfront";
import {HttpOrigin} from "aws-cdk-lib/aws-cloudfront-origins";
import {Code, Runtime} from "aws-cdk-lib/aws-lambda";
import {StringParameter} from "aws-cdk-lib/aws-ssm";
import * as path from "path";
import {ARecord, HostedZone, IHostedZone, RecordTarget} from "aws-cdk-lib/aws-route53";
import {Certificate, CertificateValidation} from "aws-cdk-lib/aws-certificatemanager";
import {CloudFrontTarget} from "aws-cdk-lib/aws-route53-targets";

interface DomainRedirectionProps extends StackProps {
  domainMapConfig: DomainMapConfig[];
}

export class DomainRedirectionStack extends Stack {

  public readonly domainMapSSM: StringParameter;

  constructor(scope: Construct, id: string, props: DomainRedirectionProps) {
    super(scope, id, props);

    this.domainMapSSM = new StringParameter(this, 'DomainMapConfig', {
      parameterName: 'DomainMapConfig',
      simpleName: true,
      stringValue: JSON.stringify(props.domainMapConfig),
    });
    new CfnOutput(this, 'DomainMapParameterName', { value: this.domainMapSSM.parameterName });

    const redirectLambda = new cloudfront.experimental.EdgeFunction(this, 'Redirect', {
      runtime: Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: Code.fromAsset(path.join(__dirname, '../resources/redirect-lambda')),
    });
    this.domainMapSSM.grantRead(redirectLambda);

    props.domainMapConfig.map((domainName) => {
      console.log(`Parsing domain config: ${domainName.hostZoneName}`);
      const sourceDomains: string[] = []
      const subDomains: string[] = []

      domainName.redirects.map((redirect) => {
        subDomains.push(redirect.subDomain)
        sourceDomains.push(`${redirect.subDomain}.${domainName.hostZoneName}`)
      });
      const identifier = domainName.hostZoneName.replace(/[^a-z0-9]/gi, '');
      const hostedZone = HostedZone.fromHostedZoneAttributes(this, `${identifier}HostedZone`, {
        hostedZoneId: domainName.hostedZoneId,
        zoneName: domainName.hostZoneName
      });
      const acmCertificate = this.getAcmCertificateArn(identifier, hostedZone);
      const distribution = this.createDistribution(
        identifier,
        sourceDomains,
        redirectLambda,
        acmCertificate
      );

      for (const subDomain of subDomains) {
        const aRecord = new ARecord(this, `${subDomain}ARecord`, {
          comment: 'Alias record to CloudFront distribution',
          zone: hostedZone,
          recordName: subDomain,
          target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        });
      }
    });
  }

  createDistribution(identifier: string,
                     sourceDomains: string[],
                     redirectLambda: cloudfront.experimental.EdgeFunction,
                     acmCertificate: Certificate
  ): Distribution {
    const distribution = new cloudfront.Distribution(this, `${identifier}Distribution`, {
      defaultBehavior: {
        origin: new HttpOrigin('weirdion.com'),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [
          {
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
            functionVersion: redirectLambda.currentVersion,
            includeBody: true,
          }
        ]
      },
      domainNames: sourceDomains,
      certificate: acmCertificate,
      enableLogging: true
    });

    new CfnOutput(this, identifier, { value: distribution.domainName });
    return distribution;
  }

  getAcmCertificateArn(identifier: string, hostedZone: IHostedZone) {
    return new Certificate(this, `${identifier}Certificate`, {
      domainName: `*.${hostedZone.zoneName}`,
      certificateName: `${hostedZone.zoneName} Certificate`,
      validation: CertificateValidation.fromDns(hostedZone),
    });
  }
}
