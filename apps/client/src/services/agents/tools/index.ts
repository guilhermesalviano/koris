import { CommandFn } from '../../../types/tools';
import { executeCurl } from './curl-request';
import { executeCommand } from './execute-command';
import { executeGetSkill } from './get-skill';
import { setTask } from './task/create';
import { listTasks } from './task/list';
import { updateTask } from './task/update';
import { deleteTask } from './task/delete';

export const COMMAND_MAP: { [key: string]: CommandFn } = {
  'execute_command': executeCommand,
  'get_skill': executeGetSkill,
  'curl_request': executeCurl,
  'set_task': setTask,
  'list_tasks': listTasks,
  'update_task': updateTask,
  'delete_task': deleteTask,
};