import { CommandFn } from '../../../types/tools';
import { executeCurl } from './curl-request';
import { executeCommand } from './execute-command';
import { executeGetSkill } from './get-skill';

export const COMMAND_MAP: { [key: string]: CommandFn } = {
  'execute_command': executeCommand,
  'get_skill': executeGetSkill,
  'curl_request': executeCurl,
};