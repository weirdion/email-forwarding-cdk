from ast import alias
import re
from dataclasses import dataclass
import json
import os
from typing import List
import boto3

from aws_lambda_powertools import Logger


EMAIL_MAP_SSM = os.environ["EMAIL_MAP_SSM"]
EMAIL_FORMAT = r"([a-zA-Z0-9_]+)[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)"
log = Logger(child=True)


@dataclass
class EmailForwardMap:
    # {
    #     "from_sender": "no-reply@example.com",
    #     "alias": "a@example.com",
    #     "recipients": [
    #         "a@myExistingEmail.com",
    #         "b@myExistingEmail.com"
    #     ],
    #     "email_prefix": "FW: "
    # }
    from_sender: str
    alias: str
    recipients: List[str]
    email_prefix: str

    def get_recipients(self):
        return  ", ".join(self.recipients)


class SSMHandler:
    def __init__(self):
        self.ssm_client = boto3.client("ssm")
        response = self.ssm_client.get_parameter(Name=EMAIL_MAP_SSM, WithDecryption=True)
        self.email_map = response["Parameter"]["Value"]
        email_map_list = json.loads(self.email_map)
        self.email_fw_map: List[EmailForwardMap] = []
        for map in email_map_list:
            self.email_fw_map.append(EmailForwardMap(**map))

    def get_recipients_for_address(self, to_address: str):
        # -1 to get the last tuple and ignore naming like Ankit <ankit@example.com>
        sanitized_to_address = "@".join(re.findall(EMAIL_FORMAT, to_address)[-1])

        for map in self.email_fw_map:
            if sanitized_to_address == map.alias:
                log.info(f"Mapping To address from: {to_address} -> {map.alias} -> {map.recipients}")
                return map
        return None
