import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('transaction-logs')
export class TransactionLogProcessor {
  @Process()
  async handleLog(job: Job) {
    const logData = job.data;
    console.log('Processing transaction log:', logData);
  }
}