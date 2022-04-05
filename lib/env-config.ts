import { config } from 'dotenv';
import { env } from 'process';
import * as emailMap from '../email-map.json';

config();

/**
 * Throws error given an error message
 * @param message Error message to log
 */
export const throwError = (message: string): string => {
    throw new Error(message);
};

// .env variables
// AWS Doc: https://docs.aws.amazon.com/ses/latest/dg/receiving-email-concepts.html

export const RECIPIENT_DOMAIN_LIST = env.RECIPIENT_DOMAIN_LIST?.split(',') ??
    throwError('RECIPIENT_DOMAIN_LIST must be defined in .env file or as an environment variable')

export const BOUNCE_DOMAIN_LIST = env.BOUNCE_DOMAIN_LIST?.split(',') ??
    throwError('BOUNCE_DOMAIN_LIST must be defined in .env file or as an environment variable')

export const BOUNCE_EMAIL_SENDER = env.BOUNCE_EMAIL_SENDER ??
    throwError('BOUNCE_EMAIL_SENDER must be defined in .env file or as an environment variable')

export const EMAIL_MAP = JSON.stringify(emailMap)