import * as fs from "fs";

export interface RedirectConfig {
  readonly sourceDomain: string;
  readonly targetDomain: string;
}

export interface EmailConfig {
  readonly fromSender: string;
  readonly alias: string;
  readonly recipients: string[];
  readonly subjectPrefix: string;
}

export interface DomainMapConfig {
  readonly hostZoneName: string;
  readonly hostedZoneId: string;
  readonly redirects: RedirectConfig[];
  readonly bounceEmail: string;
  readonly emails: EmailConfig[];
}


export const loadDomainMap = (): DomainMapConfig[] => {
  const rawdata = fs.readFileSync('domain-map.json', 'utf-8');
  const domainMaps = JSON.parse(rawdata);

  console.log(domainMaps);
  if (domainMaps === undefined) {
    throw new Error('domainMaps is undefined or empty');
  }

  let domainMapList: DomainMapConfig[] = [];

  // parse domainMaps into DomainMap interface and return the object
  for (const domainMapKey in domainMaps) {
    if (domainMaps.hasOwnProperty(domainMapKey)) {
      const domainMap = domainMaps[domainMapKey];
      console.log(domainMap);

      // check if the domainMap is valid
      if (domainMap.hostZoneName === undefined || domainMap.hostedZoneId === undefined || domainMap.redirects === undefined) {
        throw new Error('domainMap is invalid');
      }

      // check if the redirects are valid
      for (const redirect of domainMap.redirects) {
        if (redirect.sourceDomain === undefined || redirect.targetDomain === undefined) {
          throw new Error('redirect is invalid');
        }
      }

      // check if the emails are valid
      if (domainMap.bounceEmail === undefined || domainMap.emails === undefined) {
        throw new Error('email is invalid');
      }
      for (const email of domainMap.emails) {
        if (email.fromSender === undefined || email.alias === undefined || email.recipients === undefined || email.subjectPrefix === undefined) {
          throw new Error('email is invalid');
        }
      }

      domainMapList.push(domainMap);
    }
  }

  return domainMapList;
};
