#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { EmailForwardingCdkStack } from '../lib/email-forwarding-cdk-stack';

const app = new App();
new EmailForwardingCdkStack(app, 'EmailForwardingCdkStack');
