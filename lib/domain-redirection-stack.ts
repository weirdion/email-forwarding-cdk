import {Stack, StackProps} from "aws-cdk-lib";
import {DomainMapConfig} from "./domain-map-config";
import {Construct} from "constructs";
import {HttpsRedirect} from "aws-cdk-lib/aws-route53-patterns";
import {HostedZone} from "aws-cdk-lib/aws-route53";

interface DomainRedirectionProps extends StackProps {
  domainMapConfig: DomainMapConfig[];
}

export class DomainRedirectionStack extends Stack {

  constructor(scope: Construct, id: string, props: DomainRedirectionProps) {
    super(scope, id, props);

    for (const domainMap of props.domainMapConfig) {
      for (const redirect of domainMap.redirects) {
        new HttpsRedirect(this, 'DomainRedirect', {
          recordNames: [redirect.sourceDomain],
          targetDomain: redirect.targetDomain,
          zone: HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
            hostedZoneId: domainMap.hostedZoneId,
            zoneName: domainMap.hostZoneName,
          }),
        });
      }
    }
  }
}
