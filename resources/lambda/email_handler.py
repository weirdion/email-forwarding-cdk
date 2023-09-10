# Original code taken lovingly from AWS Blog:
# https://aws.amazon.com/blogs/messaging-and-targeting/forward-incoming-email-to-an-external-destination/
# Copyright 2010-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# This file is licensed under the Apache License, Version 2.0 (the "License").
# You may not use this file except in compliance with the License. A copy of the
# License is located at
#
# http://aws.amazon.com/apache2.0/
#
# This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS
# OF ANY KIND, either express or implied. See the License for the specific
# language governing permissions and limitations under the License.

import email
import os
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict

import boto3
from aws_lambda_powertools import Logger
from botocore.exceptions import ClientError

from ssm_handler import SSMHandler, EmailConfig

region = os.environ["REGION"]
incoming_email_bucket = os.environ["BUCKET_NAME"]
incoming_email_prefix = os.environ["EMAIL_S3_PREFIX"]

log = Logger(child=True)


def get_message_from_s3(message_id) -> Dict:
    if incoming_email_prefix:
        object_path = f"{incoming_email_prefix}/{message_id}"
    else:
        object_path = message_id

    object_http_path = f"https://s3.console.aws.amazon.com/s3/object/{incoming_email_bucket}/{object_path}?region={region}"

    # Create a new S3 client.
    client_s3 = boto3.client("s3")

    # Get the email object from the S3 bucket.
    object_s3 = client_s3.get_object(Bucket=incoming_email_bucket, Key=object_path)
    # Read the content of the message.
    file = object_s3["Body"].read()

    file_dict = {"file": file, "path": object_http_path}

    return file_dict


def create_message(file_dict: Dict, ssm_handler: SSMHandler):
    string_msg = file_dict["file"].decode("utf-8")

    # Create a MIME container.
    msg = MIMEMultipart("alternative")

    # Parse the email body.
    mail_object = email.message_from_string(file_dict["file"].decode("utf-8"))
    log.info(f"Mail object: {mail_object}")

    # Get original sender, reply-to, recipient, cc and return-path
    return_path = mail_object["Return-Path"]
    return_path = return_path.replace("<", "")
    return_path = return_path.replace(">", "")

    from_address = mail_object["From"]
    reply_to_address = mail_object["Reply-To"]
    recipient_address = mail_object["To"]
    recipient_cc_address = mail_object["Cc"]

    # Create a new subject line.
    subject = mail_object["Subject"]
    log.info(f"Subject: {subject}")

    # Match receiving address with alias email map
    email_fwd_map: EmailConfig = ssm_handler.get_recipients_for_address(
        recipient_address
    )
    if not email_fwd_map:
        raise ValueError(f"There was no match for to-address: {recipient_address}")

    fwd_recipients = email_fwd_map.get_recipients()
    log.info(
        "Summary of email",
        extra={
            "Subject": subject,
            "From": from_address,
            "To": recipient_address,
            "CC": recipient_cc_address,
            "Return-path": return_path,
            "Reply-To": reply_to_address,
            "Sending-To": fwd_recipients,
        },
    )

    if mail_object.is_multipart():
        index = string_msg.find("Content-Type: multipart/")
        string_body = string_msg[index:]
        log.info(f"String body: {string_body}")

        for part in mail_object.walk():
            ctype = part.get_content_type()
            cdispo = str(part.get("Content-Disposition"))

            # case for each common content type
            if ctype == "text/plain" and "attachment" not in cdispo:
                body_part = MIMEText(
                    part.get_payload(decode=True), "plain", part.get_content_charset()
                )
                msg.attach(body_part)

            if ctype == "text/html" and "attachment" not in cdispo:
                mt = MIMEText(
                    part.get_payload(decode=True), "html", part.get_content_charset()
                )
                email.encoders.encode_quopri(mt)
                del mt["Content-Transfer-Encoding"]
                mt.add_header("Content-Transfer-Encoding", "quoted-printable")
                msg.attach(mt)

            if "attachment" in cdispo and "image" in ctype:
                mi = MIMEImage(
                    part.get_payload(decode=True), ctype.replace("image/", "")
                )
                del mi["Content-Type"]
                del mi["Content-Disposition"]
                mi.add_header("Content-Type", ctype)
                mi.add_header("Content-Disposition", cdispo)
                msg.attach(mi)

            if "attachment" in cdispo and "application" in ctype:
                ma = MIMEApplication(
                    part.get_payload(decode=True), ctype.replace("application/", "")
                )
                del ma["Content-Type"]
                del ma["Content-Disposition"]
                ma.add_header("Content-Type", ctype)
                ma.add_header("Content-Disposition", cdispo)
                msg.attach(ma)

    # not multipart - i.e. plain text, no attachments, keeping fingers crossed
    else:
        body = MIMEText(mail_object.get_payload(decode=True), "UTF-8")
        msg.attach(body)

    # The file name to use for the attached message. Uses regex to remove all
    # non-alphanumeric characters, and appends a file extension.
    # filename = re.sub("[^0-9a-zA-Z]+", "_", subject)

    # Add subject, from and to lines.
    msg["Subject"] = f"{email_fwd_map.subject_prefix}{subject}"
    msg["From"] = email_fwd_map.from_sender
    msg["To"] = fwd_recipients
    # msg["Cc"] = recipient_cc_address
    msg["reply-to"] = reply_to_address if reply_to_address else from_address

    # Create a new MIME object.
    # att = MIMEApplication(file_dict["file"], filename)
    # att.add_header("Content-Disposition", "attachment", filename=filename)
    # Attach the file object to the message.
    # msg.attach(att)

    message = {
        "Source": email_fwd_map.from_sender,
        "Destinations": email_fwd_map.recipients,
        "Data": msg.as_string(),
    }
    return message


def send_email(message):
    # Create a new SES client.
    client_ses = boto3.client("ses", region)
    # Send the email.
    try:
        # Provide the contents of the email.
        response = client_ses.send_raw_email(
            Source=message["Source"],
            Destinations=message["Destinations"],
            RawMessage={"Data": message["Data"]},
        )

    # Display an error if something goes wrong.
    except ClientError as e:
        log.exception("send email ClientError Exception", e)
        output = e.response["Error"]["Message"]
    else:
        output = f"Email sent! Message ID: {response['MessageId']}"

    return output
