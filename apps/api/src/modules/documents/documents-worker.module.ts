import { Module } from '@nestjs/common';
import { objectStorageProvider } from '../../adapters/storage/object-storage.provider.js';
import { StudentAnonymizedSubscriber } from './subscribers/student-anonymized.subscriber.js';

@Module({
  providers: [objectStorageProvider, StudentAnonymizedSubscriber],
})
export class DocumentsWorkerModule {}
