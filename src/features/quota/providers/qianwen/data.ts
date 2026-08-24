/**
 * Qianwen（阿里云百炼）额度数据层：Token Plan 实例用量，经 BSS 网关查询。
 * React-free / SCSS-free —— 可被 bun:test 纯逻辑测试直接消费。
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, QianwenQuotaState, QianwenTokenPlan } from '@/types';
import { apiCallApi } from '@/services/api';
import { isDisabledAuthFile, isQianwenFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

const QIANWEN_GATEWAY_URL = 'https://cli.qianwenai.com/data/v2/api.json';

// Token Plan commodity codes (CN site). Personal and team editions are queried
// separately so an account with both shows both.
const QIANWEN_TOKEN_PLAN_CODES: Array<{ edition: QianwenTokenPlan['edition']; code: string }> = [
  { edition: 'personal', code: 'sfm_tokenplanpersonal_dp_cn' },
  { edition: 'team', code: 'sfm_tokenplanteams_dp_cn' },
  { edition: 'addon', code: 'sfm_tokenplanteamsaddon_dp_cn' },
];

const buildQianwenGatewayBody = (action: string, params: Record<string, unknown>): string =>
  JSON.stringify({ product: 'BssOpenAPI-V3', action, region: 'cn-beijing', params });

const toQianwenNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const parseQianwenFrInstance = (
  item: Record<string, unknown>,
  edition: QianwenTokenPlan['edition']
): QianwenTokenPlan | null => {
  const total = toQianwenNumber(item.InitCapacityBaseValue);
  const remaining = toQianwenNumber(item.CurrCapacityBaseValue);
  if (total <= 0 && remaining <= 0) return null;
  const used =
    total > 0 ? Math.max(0, Math.min(100, Math.round(((total - remaining) / total) * 100))) : 0;
  const commodity = item.Commodity as { Name?: string } | undefined;
  const status = item.Status as { Code?: string } | undefined;
  const planName =
    (typeof item.CommodityName === 'string' && item.CommodityName) ||
    (commodity?.Name ?? '') ||
    (edition === 'team'
      ? 'Token Plan Team'
      : edition === 'addon'
        ? 'Token Plan Addon'
        : 'Token Plan Personal');
  const endTimeRaw = item.EndTime;
  const endTime = typeof endTimeRaw === 'number' ? endTimeRaw : null;
  return {
    planName,
    edition,
    totalCredits: total,
    remainingCredits: remaining,
    usedPercent: used,
    unit: (typeof item.CurrCapacityViewUnit === 'string' && item.CurrCapacityViewUnit) || 'Credits',
    status: (typeof item.StatusCode === 'string' && item.StatusCode) || (status?.Code ?? ''),
    endTime,
    enableRenew: item.EnableRenew === true,
    instanceId: (typeof item.InstanceId === 'string' && item.InstanceId) || '',
  };
};

const fetchQianwenTokenPlans = async (
  authIndex: string,
  edition: QianwenTokenPlan['edition'],
  code: string
): Promise<QianwenTokenPlan[]> => {
  const result = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: QIANWEN_GATEWAY_URL,
    header: { 'Content-Type': 'application/json', Authorization: 'Bearer $TOKEN$' },
    data: buildQianwenGatewayBody('DescribeFrInstances', {
      Group: 'tokenPlan',
      CommodityCode: code,
      PageNum: 1,
      PageSize: 10,
    }),
  });
  if (result.statusCode < 200 || result.statusCode >= 300) return [];
  const envelope = result.body as { code?: string; data?: { Data?: unknown } } | null;
  if (!envelope || envelope.code !== '200' || !envelope.data) return [];
  const items = envelope.data.Data;
  if (!Array.isArray(items)) return [];
  const plans: QianwenTokenPlan[] = [];
  for (const raw of items) {
    if (raw && typeof raw === 'object') {
      const plan = parseQianwenFrInstance(raw as Record<string, unknown>, edition);
      if (plan) plans.push(plan);
    }
  }
  return plans;
};

export const fetchQianwenQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<QianwenTokenPlan[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('qwen_quota.missing_auth_index'));
  }

  const results = await Promise.all(
    QIANWEN_TOKEN_PLAN_CODES.map(({ edition, code }) =>
      fetchQianwenTokenPlans(authIndex, edition, code).catch(() => [] as QianwenTokenPlan[])
    )
  );
  const plans = results.flat();
  if (plans.length === 0) {
    throw new Error(t('qwen_quota.empty_data'));
  }
  return plans;
};

export const QIANWEN_CONFIG: QuotaProviderData<QianwenQuotaState, QianwenTokenPlan[]> = {
  type: 'qianwen',
  i18nPrefix: 'qwen_quota',
  filterFn: (file) => isQianwenFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchQianwenQuota,
  storeSelector: (state) => state.qianwenQuota,
  storeSetter: 'setQianwenQuota',
  buildLoadingState: () => ({ status: 'loading', plans: [] }),
  buildSuccessState: (plans) => ({ status: 'success', plans }),
  buildErrorState: (message, status) => ({
    status: 'error',
    plans: [],
    error: message,
    errorStatus: status,
  }),
};
