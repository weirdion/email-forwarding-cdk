#!/usr/bin/env node
import {App} from 'aws-cdk-lib';
import 'source-map-support/register';
import {EmailForwardingStack} from '../lib/email-forwarding-stack';
import {DomainMapConfig, loadDomainMap} from '../lib/domain-map-config';
import {DomainRedirectionStack} from "../lib/domain-redirection-stack";

const domainMapConfig: DomainMapConfig[] = loadDomainMap();
const emailForwardingDomains: string[] = [];

const env =  {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "us-east-1"
}

domainMapConfig.map((domainMap) => {
  if (domainMap.emails !== undefined && domainMap.emails.length > 0) {
    emailForwardingDomains.push(domainMap.hostZoneName);
  }
});

const app = new App();

const domainRedirectionStack = new DomainRedirectionStack(app, 'DomainRedirectionStack', {
  domainMapConfig,
  env
});
const domainMapParameterName = domainRedirectionStack.domainMapSSM.parameterName;


if (emailForwardingDomains.length > 0) {
  new EmailForwardingStack(app, 'EmailForwardingStack', {
    domainMapConfig,
    emailForwardingDomains,
    domainMapParameterName,
    env
  });
}
