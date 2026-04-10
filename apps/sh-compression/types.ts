export interface Instruction {
  type: 'read_file' | 'write_file' | 'list_dir' | 'execute_command' | 'search' | 'unknown';
  params: string;
}
