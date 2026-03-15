/**
 * Integration tests for perps command — wallets, sweep, create-wallet,
 * rename-wallet, transfer, and autopilot wallet selection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai', confirmBeforeTransaction: false }),
}));

vi.mock('../../src/api/perps.js', () => ({
  listSubAccounts: vi.fn(),
  createSubAccount: vi.fn(),
  renameSubAccount: vi.fn(),
  getSubAccountSummary: vi.fn(),
  getAggregatedSummary: vi.fn(),
  sweepFunds: vi.fn(),
  transferFunds: vi.fn(),
  getStrategies: vi.fn(),
  getAccountSummary: vi.fn(),
  enableStrategy: vi.fn(),
  disableStrategy: vi.fn(),
  createStrategy: vi.fn(),
  getSupportedSymbols: vi.fn(),
  updateStrategy: vi.fn(),
  getPerformanceMetrics: vi.fn(),
  getRecords: vi.fn(),
  getMinEquityValue: vi.fn(),
  setMinEquityValue: vi.fn(),
  getPerpsAddress: vi.fn(),
  getAssetMeta: vi.fn().mockResolvedValue([]),
  getOpenOrders: vi.fn().mockResolvedValue([]),
  getUserFills: vi.fn().mockResolvedValue([]),
  getUserLeverage: vi.fn().mockResolvedValue([]),
  placeOrders: vi.fn(),
  cancelOrders: vi.fn(),
  deposit: vi.fn(),
  withdraw: vi.fn(),
  updateLeverage: vi.fn(),
  getFundRecords: vi.fn(),
  getDecisions: vi.fn(),
  claimRewards: vi.fn(),
  priceAnalysis: vi.fn(),
  getSubAccountRecords: vi.fn(),
  getSubAccountFills: vi.fn(),
  getSubAccountOpenOrders: vi.fn(),
  getCompletedTrades: vi.fn(),
  getTokenPrices: vi.fn(),
  getEquityHistory: vi.fn(),
  getPositions: vi.fn(),
  modifyOrders: vi.fn(),
}));

vi.mock('../../src/touchid.js', () => ({
  requireTouchId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
  number: vi.fn(),
}));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ stop: () => { }, text: '' }) }),
}));

vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils.js')>();
  return {
    ...actual,
    requireTransactionConfirmation: vi.fn().mockResolvedValue(undefined),
  };
});

import { requireAuth } from '../../src/config.js';
import * as perpsApi from '../../src/api/perps.js';
import { select, input, confirm } from '@inquirer/prompts';

const mockRequireAuth = vi.mocked(requireAuth);
const mockListSubAccounts = vi.mocked(perpsApi.listSubAccounts);
const mockCreateSubAccount = vi.mocked(perpsApi.createSubAccount);
const mockRenameSubAccount = vi.mocked(perpsApi.renameSubAccount);
const mockGetSubAccountSummary = vi.mocked(perpsApi.getSubAccountSummary);
const mockGetAggregatedSummary = vi.mocked(perpsApi.getAggregatedSummary);
const mockSweepFunds = vi.mocked(perpsApi.sweepFunds);
const mockTransferFunds = vi.mocked(perpsApi.transferFunds);
const mockGetStrategies = vi.mocked(perpsApi.getStrategies);
const mockGetAccountSummary = vi.mocked(perpsApi.getAccountSummary);
const mockEnableStrategy = vi.mocked(perpsApi.enableStrategy);
const mockDisableStrategy = vi.mocked(perpsApi.disableStrategy);
const mockCreateStrategy = vi.mocked(perpsApi.createStrategy);
const mockGetSupportedSymbols = vi.mocked(perpsApi.getSupportedSymbols);
const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockConfirm = vi.mocked(confirm);

function getCmd(name: string) {
  // lazy import so each test gets a fresh singleton (Commander caches state)
  return import('../../src/commands/perps.js').then((m) =>
    m.perpsCommand.commands.find((c) => c.name() === name || c.aliases().includes(name))!,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockReturnValue({ accessToken: 'test-token' });
});

const WALLET_DEFAULT = {
  _id: 'w-default', name: 'Main', address: '0xAAA', isDefault: true,
  equityValue: 1000, dispatchableValue: 500, totalUnrealizedPnl: 50, totalMarginUsed: 200,
  positions: [],
};
const WALLET_SUB1 = {
  _id: 'w-sub1', name: 'Bot-1', address: '0xBBB', isDefault: false,
  equityValue: 300, dispatchableValue: 100, totalUnrealizedPnl: -10, totalMarginUsed: 80,
  positions: [],
};

// ─── wallets ─────────────────────────────────────────────────────────────

describe('perps wallets command', () => {
  it('should list all wallets with equity and autopilot status', async () => {
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT, WALLET_SUB1] as never,
    });
    mockGetStrategies.mockResolvedValue({
      success: true, data: [
        { _id: 'strat1', status: 'active', symbols: ['BTC'], subAccountId: 'w-default' },
      ] as never,
    });
    mockGetSubAccountSummary
      .mockResolvedValueOnce({
        success: true,
        data: { equityValue: 1000, dispatchableValue: 500, totalUnrealizedPnl: 50, totalMarginUsed: 200, positions: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { equityValue: 300, dispatchableValue: 100, totalUnrealizedPnl: -10, totalMarginUsed: 80, positions: [] },
      });
    mockGetAggregatedSummary.mockResolvedValue({
      success: true, data: { totalEquity: 1300, totalUnrealizedPnl: 40 },
    });

    const cmd = await getCmd('wallets');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });
    const full = output.join('\n');

    expect(full).toContain('Main');
    expect(full).toContain('Bot-1');
    expect(full).toContain('0xAAA');
    expect(full).toContain('0xBBB');
    expect(full).toContain('Aggregated');

    logSpy.mockRestore();
  });

  it('should show info when no wallets found', async () => {
    mockListSubAccounts.mockResolvedValue({ success: true, data: [] as never });
    mockGetStrategies.mockResolvedValue({ success: true, data: [] as never });

    const cmd = await getCmd('wallets');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });
    expect(output.join('\n')).toContain('No perps wallets');

    logSpy.mockRestore();
  });
});

// ─── create-wallet ──────────────────────────────────────────────────────

describe('perps create-wallet command', () => {
  it('should create a wallet with --name flag', async () => {
    mockCreateSubAccount.mockResolvedValue({
      success: true, data: { _id: 'new-w', name: 'Sniper', address: '0xCCC' } as never,
    });

    const cmd = await getCmd('create-wallet');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync(['-n', 'Sniper'], { from: 'user' });

    expect(mockCreateSubAccount).toHaveBeenCalledWith('test-token', { name: 'Sniper' });
    expect(output.join('\n')).toContain('Sniper');
    expect(output.join('\n')).toContain('0xCCC');

    logSpy.mockRestore();
  });

  it('should handle API error gracefully', async () => {
    mockCreateSubAccount.mockResolvedValue({
      success: false, error: { code: 400, message: 'Name too long' },
    } as never);

    const cmd = await getCmd('create-wallet');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    await expect(
      cmd.parseAsync(['-n', 'ValidName'], { from: 'user' }),
    ).rejects.toThrow('exit');

    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

// ─── rename-wallet ──────────────────────────────────────────────────────

describe('perps rename-wallet command', () => {
  it('should rename a selected wallet', async () => {
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT, WALLET_SUB1] as never,
    });
    mockSelect.mockResolvedValueOnce(WALLET_SUB1 as never);
    mockInput.mockResolvedValueOnce('Renamed' as never);
    mockRenameSubAccount.mockResolvedValue({ success: true } as never);

    const cmd = await getCmd('rename-wallet');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });

    expect(mockRenameSubAccount).toHaveBeenCalledWith('test-token', {
      subAccountId: 'w-sub1',
      name: 'Renamed',
    });
    expect(output.join('\n')).toContain('Renamed');

    logSpy.mockRestore();
  });
});

// ─── sweep ──────────────────────────────────────────────────────────────

describe('perps sweep command', () => {
  it('should sweep funds from sub-wallet when autopilot is OFF', async () => {
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT, WALLET_SUB1] as never,
    });
    mockGetStrategies.mockResolvedValue({
      success: true, data: [
        { _id: 'strat1', status: 'disabled', symbols: ['BTC'], subAccountId: 'w-sub1' },
      ] as never,
    });
    mockSelect.mockResolvedValueOnce(WALLET_SUB1 as never);
    mockSweepFunds.mockResolvedValue({ success: true, data: { txHash: '0xSweep' } });

    const cmd = await getCmd('sweep');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync(['-y'], { from: 'user' });

    expect(mockSweepFunds).toHaveBeenCalledWith('test-token', { subAccountId: 'w-sub1' });
    expect(output.join('\n')).toContain('swept');

    logSpy.mockRestore();
  });

  it('should block sweep when autopilot is ON for the wallet', async () => {
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT, WALLET_SUB1] as never,
    });
    mockGetStrategies.mockResolvedValue({
      success: true, data: [
        { _id: 'strat1', status: 'active', symbols: ['BTC'], subAccountId: 'w-sub1' },
      ] as never,
    });
    mockSelect.mockResolvedValueOnce(WALLET_SUB1 as never);

    const cmd = await getCmd('sweep');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync(['-y'], { from: 'user' });

    expect(mockSweepFunds).not.toHaveBeenCalled();
    expect(output.join('\n')).toContain('is ON for');

    logSpy.mockRestore();
  });

  it('should show info when no sub-wallets exist', async () => {
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT] as never,
    });
    mockGetStrategies.mockResolvedValue({ success: true, data: [] as never });

    const cmd = await getCmd('sweep');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });
    expect(output.join('\n')).toContain('No sub-wallets');

    logSpy.mockRestore();
  });
});

// ─── transfer ───────────────────────────────────────────────────────────

describe('perps transfer command', () => {
  it('should transfer funds between wallets', async () => {
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT, WALLET_SUB1] as never,
    });
    // First select: from wallet, second: to wallet
    mockSelect.mockResolvedValueOnce(WALLET_DEFAULT as never);
    mockSelect.mockResolvedValueOnce(WALLET_SUB1 as never);
    const mockNumber = vi.mocked((await import('@inquirer/prompts')).number);
    mockNumber.mockResolvedValueOnce(50 as never);
    mockTransferFunds.mockResolvedValue({ success: true, data: { txHash: '0xTransfer' } });

    const cmd = await getCmd('transfer');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync(['-y'], { from: 'user' });

    expect(mockTransferFunds).toHaveBeenCalledWith('test-token', {
      fromSubAccountId: undefined,  // default wallet → omitted
      toSubAccountId: 'w-sub1',
      amount: 50,
    });
    expect(output.join('\n')).toContain('Transferred');

    logSpy.mockRestore();
  });

  it('should require at least 2 wallets', async () => {
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT] as never,
    });

    const cmd = await getCmd('transfer');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });
    expect(output.join('\n')).toContain('at least 2 wallets');

    logSpy.mockRestore();
  });
});

// ─── autopilot (wallet selection) ────────────────────────────────────────

describe('perps autopilot command', () => {
  const setupAutopilotMocks = () => {
    mockGetSupportedSymbols.mockResolvedValue({
      success: true, data: ['BTC', 'ETH', 'SOL'] as never,
    });
    vi.mocked(perpsApi.getPerformanceMetrics).mockResolvedValue({
      success: true, data: { totalPnl: 100, winRate: 55 },
    });
    vi.mocked(perpsApi.getRecords).mockResolvedValue({
      success: true, data: [] as never,
    });
  };

  it('should let user select wallet and enable single strategy', async () => {
    setupAutopilotMocks();
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT, WALLET_SUB1] as never,
    });
    mockGetStrategies.mockResolvedValue({
      success: true, data: [
        { _id: 'strat1', name: 'Alpha', status: 'disabled', symbols: ['BTC'], subAccountId: 'w-default' },
      ] as never,
    });
    // 1st select: pick wallet
    // (single strategy auto-selected, dashboard shown)
    // 2nd select: enable, 3rd select: back
    mockSelect.mockResolvedValueOnce(WALLET_DEFAULT as never);
    mockSelect.mockResolvedValueOnce('on' as never);
    mockSelect.mockResolvedValueOnce('back' as never);
    mockEnableStrategy.mockResolvedValue({ success: true, data: {} });

    const cmd = await getCmd('autopilot');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });

    expect(mockEnableStrategy).toHaveBeenCalledWith('test-token', 'strat1');
    expect(output.join('\n')).toContain('ON');
    expect(output.join('\n')).toContain('Alpha');

    logSpy.mockRestore();
  });

  it('should disable autopilot for selected wallet', async () => {
    setupAutopilotMocks();
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT, WALLET_SUB1] as never,
    });
    mockGetStrategies.mockResolvedValue({
      success: true, data: [
        { _id: 'strat2', name: 'Beta', status: 'active', symbols: ['ETH'], subAccountId: 'w-sub1' },
      ] as never,
    });
    // 1st: pick wallet, (single strategy auto-selected, dashboard shown)
    // 2nd: off, confirm, 3rd: back
    mockSelect.mockResolvedValueOnce(WALLET_SUB1 as never);
    mockSelect.mockResolvedValueOnce('off' as never);
    mockConfirm.mockResolvedValueOnce(true as never);
    mockSelect.mockResolvedValueOnce('back' as never);
    mockDisableStrategy.mockResolvedValue({ success: true, data: {} });

    const cmd = await getCmd('autopilot');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });

    expect(mockDisableStrategy).toHaveBeenCalledWith('test-token', 'strat2');
    expect(output.join('\n')).toContain('OFF');

    logSpy.mockRestore();
  });

  it('should create strategy when wallet has none', async () => {
    setupAutopilotMocks();
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_SUB1] as never,
    });
    mockGetStrategies.mockResolvedValue({ success: true, data: [] as never });
    // No strategies → create/attach prompt: create, symbols input, config input
    mockSelect.mockResolvedValueOnce('create' as never);
    mockInput.mockResolvedValueOnce('BTC,ETH' as never);
    mockInput.mockResolvedValueOnce('{}' as never);
    mockCreateStrategy.mockResolvedValue({ success: true, data: {} });

    const cmd = await getCmd('autopilot');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    await cmd.parseAsync([], { from: 'user' });

    expect(mockCreateStrategy).toHaveBeenCalledWith('test-token', {
      symbols: ['BTC', 'ETH'],
      subAccountId: 'w-sub1',
      strategyConfig: undefined,
    });

    logSpy.mockRestore();
  });

  it('should show all strategies and let user pick when multiple exist', async () => {
    setupAutopilotMocks();
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT] as never,
    });
    mockGetStrategies.mockResolvedValue({
      success: true, data: [
        { _id: 'strat1', name: 'Alpha', status: 'active', symbols: ['BTC'], subAccountId: 'w-default' },
        { _id: 'strat2', name: 'Beta', status: 'disabled', symbols: ['ETH', 'SOL'] },
      ] as never,
    });
    const stratBeta = { active: false, strategyId: 'strat2', name: 'Beta', symbols: ['ETH', 'SOL'], raw: {} };
    // 1 wallet auto-selected → 2 strategies listed → pick strat2 → dashboard → back
    mockSelect.mockResolvedValueOnce(stratBeta as never);
    mockSelect.mockResolvedValueOnce('back' as never);

    const cmd = await getCmd('autopilot');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });

    const full = output.join('\n');
    expect(full).toContain('Alpha');
    expect(full).toContain('Beta');
    expect(full).toContain('strat2');

    logSpy.mockRestore();
  });
});

// ─── positions (multi-wallet) ───────────────────────────────────────────

describe('perps positions command (multi-wallet)', () => {
  it('should display positions per wallet', async () => {
    mockListSubAccounts.mockResolvedValue({
      success: true, data: [WALLET_DEFAULT, WALLET_SUB1] as never,
    });
    mockGetSubAccountSummary
      .mockResolvedValueOnce({
        success: true,
        data: { equityValue: 1000, totalUnrealizedPnl: 50, totalMarginUsed: 200, positions: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          equityValue: 300, totalUnrealizedPnl: -10, totalMarginUsed: 80,
          positions: [{ symbol: 'BTC', side: 'long', size: '0.1', entryPrice: '60000' }],
        },
      });
    mockGetAggregatedSummary.mockResolvedValue({
      success: true, data: { totalEquity: 1300, totalUnrealizedPnl: 40, totalMarginUsed: 280 },
    });

    const cmd = await getCmd('positions');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });
    const full = output.join('\n');

    expect(full).toContain('Main');
    expect(full).toContain('Bot-1');
    expect(full).toContain('Total positions');

    logSpy.mockRestore();
  });

  it('should fallback to legacy API when no wallets returned', async () => {
    mockListSubAccounts.mockResolvedValue({ success: true, data: [] as never });
    mockGetAccountSummary.mockResolvedValue({
      success: true,
      data: { equityValue: 500, totalUnrealizedPnl: 0, totalMarginUsed: 100, positions: [] },
    });

    const cmd = await getCmd('positions');
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await cmd.parseAsync([], { from: 'user' });
    const full = output.join('\n');

    expect(full).toContain('No open positions');
    expect(mockGetAccountSummary).toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
