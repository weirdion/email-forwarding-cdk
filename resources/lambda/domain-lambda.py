from logging import Logger

from ssm_handler import SSMHandler

log = Logger(name="RedirectLambda")
ssm_handler = SSMHandler()


def handler(event, context):
    log.info(f"Event: {event}")
    log.info(f"Context: {context}")
    log.info(f"SSMHandler: {ssm_handler.domain_map_config}")
    return {
        "status": '302',
        "statusDescription": 'Found Moved',
        "headers": {
          "location": [{
            "key": 'Location',
            "value": "https://github.com/weirdion/"
          }],
        }
  }
