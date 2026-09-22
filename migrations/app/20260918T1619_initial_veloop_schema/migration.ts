#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/39b5d1f96fd6d8563f696799f2a5e2394ca6f7133d1b8b3a64c6a2352b099841/contract';
import endContract from '../../snapshots/39b5d1f96fd6d8563f696799f2a5e2394ca6f7133d1b8b3a64c6a2352b099841/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'adEvent',
        columns: [
          col('adProvider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('completedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('eventType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('externalEventId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('referralId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('verified', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'auditLog',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('details', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('referralId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'referral',
        columns: [
          col('attributedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('referralCode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referredUserId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('referrerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('registeredAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('successfulAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'referralProgress',
        columns: [
          col('adsCompleted', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('currentMilestone', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('referralId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'rewardConfig',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('milestone', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('rewardAmount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('rewardType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'rewardTransaction',
        columns: [
          col('amount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('idempotencyKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('milestone', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referralId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('rewardType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('CREDITED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'user',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('deviceHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('referralCode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referredByUserId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'adEvent',
        constraint: 'adEvent_externalEventId_key',
        columns: ['externalEventId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'referral',
        constraint: 'referral_referredUserId_key',
        columns: ['referredUserId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'referralProgress',
        constraint: 'referralProgress_referralId_key',
        columns: ['referralId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'rewardConfig',
        constraint: 'rewardConfig_milestone_key',
        columns: ['milestone'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'rewardTransaction',
        constraint: 'rewardTransaction_idempotencyKey_key',
        columns: ['idempotencyKey'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_referralCode_key',
        columns: ['referralCode'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'adEvent',
        index: 'adEvent_referralId_idx_613afdc8',
        columns: ['referralId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'adEvent',
        index: 'adEvent_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_action_idx_cd0d2116',
        columns: ['action'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_referralId_idx_613afdc8',
        columns: ['referralId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auditLog',
        index: 'auditLog_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'referral',
        index: 'referral_referrerId_idx_cac6d89f',
        columns: ['referrerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'referral',
        index: 'referral_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'referralProgress',
        index: 'referralProgress_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'rewardTransaction',
        index: 'rewardTransaction_referralId_idx_613afdc8',
        columns: ['referralId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'rewardTransaction',
        index: 'rewardTransaction_rewardType_idx_b7fb0b97',
        columns: ['rewardType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'rewardTransaction',
        index: 'rewardTransaction_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user',
        index: 'user_referredByUserId_idx_f4e8dcf0',
        columns: ['referredByUserId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'adEvent',
        foreignKey: {
          name: 'adEvent_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'adEvent',
        foreignKey: {
          name: 'adEvent_referralId_fkey',
          columns: ['referralId'],
          references: { schema: 'public', table: 'referral', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'auditLog',
        foreignKey: {
          name: 'auditLog_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'auditLog',
        foreignKey: {
          name: 'auditLog_referralId_fkey',
          columns: ['referralId'],
          references: { schema: 'public', table: 'referral', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'referral',
        foreignKey: {
          name: 'referral_referrerId_fkey',
          columns: ['referrerId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'referral',
        foreignKey: {
          name: 'referral_referredUserId_fkey',
          columns: ['referredUserId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'referralProgress',
        foreignKey: {
          name: 'referralProgress_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'referralProgress',
        foreignKey: {
          name: 'referralProgress_referralId_fkey',
          columns: ['referralId'],
          references: { schema: 'public', table: 'referral', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'rewardTransaction',
        foreignKey: {
          name: 'rewardTransaction_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'rewardTransaction',
        foreignKey: {
          name: 'rewardTransaction_referralId_fkey',
          columns: ['referralId'],
          references: { schema: 'public', table: 'referral', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user',
        foreignKey: {
          name: 'user_referredByUserId_fkey',
          columns: ['referredByUserId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
