export interface IWorker {
  name: string;
  run: (args: any) => Promise<any>;
}