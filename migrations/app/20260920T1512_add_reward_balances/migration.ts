#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/619ee0ddd2ca778f7411567627496be81de454d71abff13d715e747afbb22b12/contract';
import endContract from '../../snapshots/619ee0ddd2ca778f7411567627496be81de454d71abff13d715e747afbb22b12/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fb7a7978e156206bcb2b1e87b0bde882ec79169053deddbde49fa52feb41eb9d/contract';
import startContract from '../../snapshots/fb7a7978e156206bcb2b1e87b0bde882ec79169053deddbde49fa52feb41eb9d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('gemBalance', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('spinBalance', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('sveBalance', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('tokenBalance', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('xp', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
