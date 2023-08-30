# Domain Companion

## Overview

A CDK based project with two main features:
* Domain redirection
  * provision S3 redirection based on SSM map
  * use CloudFront to add https on top of S3
* Email alias forwarding
  * use SES to receive incoming mail
  * store it in S3 bucket
  * leverage Lambda to forward the email based on a map stored in SSM

<!-- INSERT ARCHITECTURE DIAGRAM -->

## Setup Build

Before starting to build and deploy, ***please ensure that the domain and emails you are using are [verified identities] in AWS SES***.

The `domain-map.json.example` file shows an example of the email map configuration.
<br>Copy `domain-map.json.example` to `domain-map.json` file with your mapping.

```json5
{
    // hosted zone name
    "example.com": {
        // hosted zone id
        "hosted_zone_id": "ABCD1234",
        // 301 https redirection (using S3 + Cloudfront)
        "redirects": {
            // dev.example.com -> dev.to
            "dev.example.com": "dev.to"
        },
        // bounce email of emails below, only required if emails is non-empty
        "bounce_email": "no-reply@example.com",
        // emails aliases to forward, bounce_email must be set
        "emails": [
            {
                // Email address that will be used as "FROM" to receiving email
                // reply-to email will be the original sender's reply-to email
                "from_sender": "no-reply@example.com",
                // email address to capture as recipient
                // supports plus addressing, a+tag@example, a+tag2@example both would match with a@example.com
                "alias": "a@example.com",
                // email address(es) to deliver this alias to
                "recipients": [
                    "a@myExistingEmail.com",
                    "b@myExistingEmail.com"
                ],
                // prefix to add to the subject line, usually for visually categorizing types of emails for this alias
                // can be empty string or any arbitrary string of less than 13 characters
                // a space is added while joining existing subject and prefix
                "subject_prefix": "[Category1]"
            }
        ]
    }
}
```

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Build and Deploy

Before getting ready to deploy, ensure the dependencies are installed by executing the following:

```
$ npm install -g aws-cdk
$ npm install
```

### Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## LICENSE

```
Copyright (c) 2023 Ankit Sadana

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

[verified identities]: <https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html>
