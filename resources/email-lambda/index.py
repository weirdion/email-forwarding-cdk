from aws_lambda_powertools import Logger

log = Logger(service="EmaiForwardLamba")


@log.inject_lambda_context
def handler(event, context):
    # Get the unique ID of the message. This corresponds to the name of the file
    # in S3.
    message_id = event["Records"][0]["ses"]["mail"]["messageId"]
    log.info(f"Received message ID: {message_id}")
