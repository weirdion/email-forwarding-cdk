import {Stack, StackProps} from "aws-cdk-lib";
import {Architecture, Code, Function, LayerVersion, Runtime,} from "aws-cdk-lib/aws-lambda";
import {BlockPublicAccess, Bucket, BucketAccessControl, BucketEncryption,} from "aws-cdk-lib/aws-s3";
import {ReceiptRuleOptions, ReceiptRuleSet} from "aws-cdk-lib/aws-ses";
import {Bounce, BounceTemplate, Lambda, LambdaInvocationType, S3} from "aws-cdk-lib/aws-ses-actions";
import {Topic} from "aws-cdk-lib/aws-sns";
import {StringParameter} from "aws-cdk-lib/aws-ssm";
import {Construct} from "constructs";
import {loadDomainMap, DomainMapConfig} from "./domain-map-config";
import {Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";
import path = require("path");

const s3BucketPath: string = "emails";

export class DomainCompanionCdkStack extends Stack {

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const domainMapConfig: DomainMapConfig[] = loadDomainMap();

    const bucket = new Bucket(this, "EmailStore", {
      accessControl: BucketAccessControl.PRIVATE,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      versioned: false,
    });

    // Email Forwarding Lambda
    const powertoolsLayer = LayerVersion.fromLayerVersionArn(
      this,
      "LambdaPowertools",
      `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPython:40`
    );

    const emailMapSSM = new StringParameter(this, "EmailForwardingMap", {
      stringValue: JSON.stringify(domainMapConfig),
      parameterName: "EmailForwardingMap",
    });

    const emailForwardLambda = new Function(this, "EmailForwarding", {
      runtime: Runtime.PYTHON_3_11,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      code: Code.fromAsset(path.join(__dirname, "../resources/email-lambda")),
      layers: [powertoolsLayer],
      environment: {
        POWERTOOLS_SERVICE_NAME: "EmailForwardLambda",
        LOG_LEVEL: "INFO",
        REGION: this.region,
        BUCKET_NAME: bucket.bucketName,
        EMAIL_MAP_SSM: emailMapSSM.parameterName,
        EMAIL_S3_PREFIX: s3BucketPath,
      },
    });
    emailForwardLambda.addToRolePolicy(
      new PolicyStatement({
        sid: "EmailForawrdAccess",
        effect: Effect.ALLOW,
        actions: ["s3:GetObject", "ses:SendRawEmail"],
        resources: [
          `${bucket.bucketArn}/${s3BucketPath}/*`,
          `arn:aws:ses:${this.region}:${this.account}:identity/*`,
        ],
      })
    );
    emailMapSSM.grantRead(emailForwardLambda);

    // SES setup

    const bounceTopic = new Topic(this, "BounceTopic");

    const bounceDomainList: string[] = domainMapConfig.map((domainMap) => {
      return domainMap.hostZoneName;
    });

    let receiptRuleOptions: ReceiptRuleOptions[] = []
    receiptRuleOptions.push({
      scanEnabled: true,
      recipients: bounceDomainList,
      actions: [
        new S3({
          bucket,
          objectKeyPrefix: `${s3BucketPath}/`,
        }),
        new Lambda({
          function: emailForwardLambda,
          invocationType: LambdaInvocationType.EVENT,
        }),
      ],
    });
    domainMapConfig.map((domainMap) => {
      receiptRuleOptions.push(
        this.getReceiptRuleOption(bounceTopic, domainMap.hostZoneName, domainMap.bounceEmail)
      );
    });

    const ses = new ReceiptRuleSet(this, "SESRuleSet", {
      rules: receiptRuleOptions
    });
  }

  // function that returns a ReceiptRuleOption based on hostZoneName and bounceEmail
  getReceiptRuleOption(bounceTopic: Topic, hostZoneName: string, bounceEmail: string): ReceiptRuleOptions {
    return {
      scanEnabled: true,
      recipients: [hostZoneName],
      actions: [
        new Bounce({
          sender: bounceEmail,
          template: BounceTemplate.MAILBOX_DOES_NOT_EXIST,
          topic: bounceTopic,
        }),
      ],
    }
  }
}
