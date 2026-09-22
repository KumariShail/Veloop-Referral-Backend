#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/39b5d1f96fd6d8563f696799f2a5e2394ca6f7133d1b8b3a64c6a2352b099841/contract';
import startContract from '../../snapshots/39b5d1f96fd6d8563f696799f2a5e2394ca6f7133d1b8b3a64c6a2352b099841/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fb7a7978e156206bcb2b1e87b0bde882ec79169053deddbde49fa52feb41eb9d/contract';
import endContract from '../../snapshots/fb7a7978e156206bcb2b1e87b0bde882ec79169053deddbde49fa52feb41eb9d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('passwordHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
