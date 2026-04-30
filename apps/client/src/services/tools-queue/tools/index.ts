import { CommandFn } from '../../../types/tools';
import { executeCurl } from './curl-request';
import { executeCommand } from './execute-command';
import { executeGetSkill } from './get-skill';
import { setReminder } from './set-reminder';
import { listReminders } from './set-reminder/list';
import { updateReminder } from './set-reminder/update';
import { deleteReminder } from './set-reminder/delete';

export const COMMAND_MAP: { [key: string]: CommandFn } = {
  'execute_command': executeCommand,
  'get_skill': executeGetSkill,
  'curl_request': executeCurl,
  'set_reminder': setReminder,
  'list_reminders': listReminders,
  'update_reminder': updateReminder,
  'delete_reminder': deleteReminder,
};