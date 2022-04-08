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

# Original code taken lovingly from AWS Blog: https://aws.amazon.com/blogs/messaging-and-targeting/forward-incoming-email-to-an-external-destination/

import os
import boto3
import email
import re
import html
from botocore.exceptions import ClientError
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage

from aws_lambda_powertools import Logger

log = Logger(service="EmailForwardLambda")

region = os.environ["REGION"]
incoming_email_bucket = os.environ["BUCKET_NAME"]
incoming_email_prefix = os.environ["EMAIL_S3_PREFIX"]
send_from_address = os.environ["FORWARDING_SENDER"]


def get_message_from_s3(message_id):


    if incoming_email_prefix:
        object_path = f"{incoming_email_prefix}/{message_id}"
    else:
        object_path = message_id

    object_http_path = (f"http://s3.console.aws.amazon.com/s3/object/{incoming_email_bucket}/{object_path}?region={region}")

    # Create a new S3 client.
    client_s3 = boto3.client("s3")

    # Get the email object from the S3 bucket.
    object_s3 = client_s3.get_object(
        Bucket=incoming_email_bucket,
        Key=object_path
    )
    # Read the content of the message.
    file = object_s3["Body"].read()

    file_dict = {
        "file": file,
        "path": object_http_path
    }

    return file_dict


def create_message(file_dict):

    stringMsg = file_dict["file"].decode("utf-8")

    # Create a MIME container.
    msg = MIMEMultipart("alternative")

    # Parse the email body.
    mailobject = email.message_from_string(file_dict["file"].decode("utf-8"))
    log.info(f"Mail object: {mailobject}")

    # Get original sender, reply-to, recipient, cc and return-path
    return_path = mailobject["Return-Path"]
    return_path = return_path.replace("<", "")
    return_path = return_path.replace(">", "")

    from_address = mailobject["From"]
    reply_to_address = mailobject["Reply-To"]
    recipient_address = mailobject["To"]
    recipient_cc_address = mailobject["Cc"]

    
    log.info(f"From address: {from_address}")
    log.info(f"Reply To: {reply_to_address}")
    log.info(f"Recipient: {recipient_address}, CC: {recipient_cc_address}")
    log.info(f"Return path: {return_path}")

    # Create a new subject line.
    subject = mailobject["Subject"]
    log.info(f"Subject: {subject}")

    if mailobject.is_multipart():

        index = stringMsg.find("Content-Type: multipart/")
        stringBody = stringMsg[index:]
        log.info(f"String body: {stringBody}")

        for part in mailobject.walk():
            ctype = part.get_content_type()
            cdispo = str(part.get("Content-Disposition"))

            # case for each common content type
            if ctype == "text/plain" and "attachment" not in cdispo:
                bodyPart = MIMEText(part.get_payload(decode=True), "plain", part.get_content_charset())
                msg.attach(bodyPart)

            if ctype == "text/html" and "attachment" not in cdispo:
                mt = MIMEText(part.get_payload(decode=True), "html", part.get_content_charset())
                email.encoders.encode_quopri(mt)
                del mt["Content-Transfer-Encoding"]
                mt.add_header("Content-Transfer-Encoding", "quoted-printable")
                msg.attach(mt)

            if "attachment" in cdispo and "image" in ctype:
                mi = MIMEImage(part.get_payload(decode=True), ctype.replace("image/", ""))
                del mi["Content-Type"]
                del mi["Content-Disposition"]
                mi.add_header("Content-Type", ctype)
                mi.add_header("Content-Disposition", cdispo)
                msg.attach(mi)

            if "attachment" in cdispo and "application" in ctype:
                ma = MIMEApplication(part.get_payload(decode=True), ctype.replace("application/", ""))
                del ma["Content-Type"]
                del ma["Content-Disposition"]
                ma.add_header("Content-Type", ctype)
                ma.add_header("Content-Disposition", cdispo)
                msg.attach(ma)


    # not multipart - i.e. plain text, no attachments, keeping fingers crossed
    else:
        body = MIMEText(mailobject.get_payload(decode=True), "UTF-8")
        msg.attach(body)

    # The file name to use for the attached message. Uses regex to remove all
    # non-alphanumeric characters, and appends a file extension.
    filename = re.sub("[^0-9a-zA-Z]+", "_", subject)

    # Add subject, from and to lines.
    msg["Subject"] = subject
    msg["From"] = from_address
    msg["To"] = recipient_address
    msg["Cc"] = recipient_cc_address
    msg["reply-to"] = reply_to_address if reply_to_address else from_address

    # Create a new MIME object.
    att = MIMEApplication(file_dict["file"], filename)
    att.add_header("Content-Disposition", "attachment", filename=filename)

    # Attach the file object to the message.
    msg.attach(att)
    message = {
        "Source": send_from_address,
        "Destinations": recipient_address,
        "Data": msg.as_string()
    }
    return message


def send_email(message):
# Create a new SES client.
    client_ses = boto3.client("ses", region)
    # Send the email.
    try:
        #Provide the contents of the email.
        response = client_ses.send_raw_email(
            Source=message["Source"],
            Destinations=[
                message["Destinations"]
            ],
            RawMessage={
                "Data":message["Data"]
            }
        )

    # Display an error if something goes wrong.
    except ClientError as e:
        log.info("send email ClientError Exception")
        output = e.response["Error"]["Message"]
    else:
        output = f"Email sent! Message ID: {response['MessageId']}"

    return output


@log.inject_lambda_context(log_event=True)
def handler(event, context):
    # Get the unique ID of the message. This corresponds to the name of the file
    # in S3.
    message_id = event["Records"][0]["ses"]["mail"]["messageId"]
    log.info(f"Received message ID {message_id}")

    # Retrieve the file from the S3 bucket.
    file_dict = get_message_from_s3(message_id)

    # Create the message.
    message = create_message(file_dict)

    # Send the email and log.info the result.
    result = send_email(message)
    log.info(f"Result: {result}")
