from logging import Logger

from ssm_handler import SSMHandler

log = Logger(name="RedirectLambda")


def handler(event, context):
    log.info(f"Event: {event}")
    log.info(f"Context: {context}")
    try:  
      ssm_handler = SSMHandler()
      log.info(f"SSMHandler: {ssm_handler.domain_map_config}")
    except Exception as e:
       log.error(f"Error: {e}")
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
