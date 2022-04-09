from aws_lambda_powertools import Logger

import email_handler
from ssm_handler import SSMHandler

log = Logger()

ssm_handler = SSMHandler()


@log.inject_lambda_context(log_event=True)
def handler(event, context):
    # Get the unique ID of the message. This corresponds to the name of the file in S3.
    message_id = event["Records"][0]["ses"]["mail"]["messageId"]
    log.info(f"Received message ID {message_id}")

    # Retrieve the file from the S3 bucket.
    file_dict = email_handler.get_message_from_s3(message_id)

    # Create the message.
    message = email_handler.create_message(file_dict, ssm_handler)

    # Send the email and log.info the result.
    result = email_handler.send_email(message)
    log.info(f"Result: {result}")
