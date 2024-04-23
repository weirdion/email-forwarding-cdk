import re

from ssm_handler import SSMHandler

DOMAIN_REGEX = re.compile(r"([a-zA-Z0-9-.]+\.)*([a-zA-Z0-9-]+\.[a-zA-Z]+)")
DEFAULT_TARGET = "github.com/weirdion"

def handler(event, context):
	print(f"Event: {event}")
	request = event["Records"][0]["cf"]["request"]
	print(f"Request: {request}")
	headers = request["headers"]
	print(f"Headers: {headers}")

	host_value = ""
	for h in headers["host"]:
		if h["key"] == "Host":
			host_value = h["value"]
			break

	ssm_handler = SSMHandler()

	_sub_domain, _domain = re.fullmatch(DOMAIN_REGEX, host_value).groups()
	_uri_path = request["uri"]
	print(f"Matched groups: {_sub_domain} {_domain}")
	if not _sub_domain:
		_sub_domain = "."  # mark it as root domain to match domain-map
	else:
		_sub_domain = _sub_domain.strip(".")
	if not _uri_path:
		_uri_path = ""

	target_host = DEFAULT_TARGET

	for d in ssm_handler.domain_map_config:
		if _domain.casefold() == d.host_zone_name.casefold():
			print(f"Found Domain: {d.host_zone_name}")
			for r in d.redirects:
				if _sub_domain.casefold().endswith(r.sub_domain.casefold()):
					print(f"Found Redirect: {r.sub_domain} -> {r.target_domain}")
					target_host = f"{r.target_domain}"
					break
			break

	# attach _uri_path from original request
	target_host = f"{target_host}{_uri_path}"

	if not target_host.startswith("https://"):
		target_host = f"https://{target_host}"

	print(f"Target Host: {target_host}")

	return {
		"status": "302",
		"statusDescription": "Found Moved",
		"headers": {
			"location": [{
				"key": "Location",
				"value": target_host
			}],
		}
	}
