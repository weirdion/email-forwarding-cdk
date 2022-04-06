import { Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  Code,
  Function,
  LayerVersion,
  Runtime,
  Tracing,
} from "aws-cdk-lib/aws-lambda";
import {
  BlockPublicAccess,
  Bucket,
  BucketAccessControl,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { ReceiptRuleSet } from "aws-cdk-lib/aws-ses";
import {
  AddHeader,
  Bounce,
  BounceTemplate,
  Lambda,
  LambdaInvocationType,
  S3,
} from "aws-cdk-lib/aws-ses-actions";
import { Topic } from "aws-cdk-lib/aws-sns";
import { ParameterType, StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import {
  BOUNCE_DOMAIN_LIST,
  BOUNCE_EMAIL_SENDER,
  EMAIL_MAP,
  RECIPIENT_DOMAIN_LIST,
} from "./env-config";

import path = require("path");

export class EmailForwardingCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
      `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPython:16`
    );

    const emailMapSSM = new StringParameter(this, "EmailForwardingMap", {
      stringValue: EMAIL_MAP,
      type: ParameterType.STRING,
    });

    const emailForwardLambda = new Function(this, "EmailForwarding", {
      runtime: Runtime.PYTHON_3_9,
      handler: "index.handler",
      code: Code.fromAsset(path.join(__dirname, "../resources/email-lambda")),
      layers: [powertoolsLayer],
      tracing: Tracing.ACTIVE,
      environment: {
        REGION: this.region,
        BUCKET_NAME: bucket.bucketName,
        EMAIL_MAP_SSM: emailMapSSM.parameterName,
      },
    });

    // SES setup

    const bounceTopic = new Topic(this, "BounceTopic");

    const ses = new ReceiptRuleSet(this, "SESRuleSet", {
      rules: [
        {
          recipients:
            typeof RECIPIENT_DOMAIN_LIST === "string"
              ? [RECIPIENT_DOMAIN_LIST]
              : RECIPIENT_DOMAIN_LIST,
          actions: [
            new S3({
              bucket,
              objectKeyPrefix: "emails/",
            }),
            new Lambda({
              function: emailForwardLambda,
              invocationType: LambdaInvocationType.EVENT,
            })
          ],
        },
        {
          recipients:
            typeof BOUNCE_DOMAIN_LIST === "string"
              ? [BOUNCE_DOMAIN_LIST]
              : BOUNCE_DOMAIN_LIST,
          actions: [
            new Bounce({
              sender: BOUNCE_EMAIL_SENDER,
              template: BounceTemplate.MAILBOX_DOES_NOT_EXIST,
              topic: bounceTopic,
            }),
          ],
        },
      ],
    });
  }
}
