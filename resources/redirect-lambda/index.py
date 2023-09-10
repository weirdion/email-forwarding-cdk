from logging import Logger

log = Logger(name="RedirectLambda")


def handler(event, context):
    log.info(f"Event: {event}")
    log.info(f"Context: {context}")
    return {
        "status": '301',
        "statusDescription": 'Permanently Moved',
        "headers": {
          "location": [{
            "key": 'Location',
            "value": "https://github.com/weirdion/"
          }],
        }
  }
