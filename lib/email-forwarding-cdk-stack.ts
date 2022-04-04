import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketAccessControl, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { ReceiptRuleSet } from 'aws-cdk-lib/aws-ses';
import { AddHeader, Bounce, BounceTemplate, Lambda, S3 } from 'aws-cdk-lib/aws-ses-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { BOUNCE_DOMAIN_LIST, BOUNCE_EMAIL_SENDER, RECIPIENT_DOMAIN_LIST } from './env-config';

export class EmailForwardingCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'EmailStore', {
      accessControl: BucketAccessControl.PRIVATE,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      lifecycleRules: [{
        abortIncompleteMultipartUploadAfter: Duration.minutes(30),
        enabled: true,
        expiration: Duration.days(30),
      }],
      versioned: false,
    });

    const bounceTopic = new Topic(this, 'BounceTopic');

    const ses = new ReceiptRuleSet(this, 'SESRuleSet', {
      rules: [
        {
          recipients: typeof(RECIPIENT_DOMAIN_LIST) === 'string' ? [RECIPIENT_DOMAIN_LIST] : RECIPIENT_DOMAIN_LIST,
          actions: [
            new AddHeader({
              name: 'X-Special-Header',
              value: 'aws',
            }),
            new S3({
              bucket,
              objectKeyPrefix: 'emails/',
            }),
          ],
        },
        {
          recipients: typeof(BOUNCE_DOMAIN_LIST) === 'string' ? [BOUNCE_DOMAIN_LIST] : BOUNCE_DOMAIN_LIST,
          actions: [
            new Bounce({
              sender: BOUNCE_EMAIL_SENDER,
              template: BounceTemplate.MAILBOX_DOES_NOT_EXIST,
              topic: bounceTopic,
            })
          ]
        }
      ]
    });
  }
}
