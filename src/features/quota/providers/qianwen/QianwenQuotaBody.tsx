/**
 * Qianwen（阿里云百炼）额度渲染体：Token Plan 实例余量行水位条。
 */

import type { QianwenQuotaState } from '@/types';
import { QuotaMeter } from '../../components/QuotaMeter';
import type { QuotaBodyProps } from '../../types';

const QIANWEN_CONSOLE_URL = 'https://bailian.console.aliyun.com/';

const formatQianwenExpiry = (endTime: number | null): string => {
  if (!endTime) return '';
  const date = new Date(endTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};

export function QianwenQuotaBody({ quota, classes, t }: QuotaBodyProps<QianwenQuotaState>) {
  const plans = quota.plans ?? [];

  const consoleLink = (
    <a
      key="qianwen-console"
      className={classes.quotaReset}
      href={QIANWEN_CONSOLE_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t('qwen_quota.console_link')}
    </a>
  );

  if (plans.length === 0) {
    return (
      <>
        <div className={classes.quotaMessage}>{t('qwen_quota.empty_data')}</div>
        {consoleLink}
      </>
    );
  }

  return (
    <>
      {plans.map((plan, index) => {
        const remainingPct = Math.max(0, Math.min(100, 100 - plan.usedPercent));
        const creditsLabel = `${plan.remainingCredits.toLocaleString()} / ${plan.totalCredits.toLocaleString()} ${plan.unit}`;
        const expiryLabel = formatQianwenExpiry(plan.endTime);

        return (
          <div
            key={plan.instanceId || `qianwen-${index}`}
            className={classes.quotaRow}
          >
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>{plan.planName}</span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaPercent}>{remainingPct}%</span>
                {expiryLabel && <span className={classes.quotaReset}>{expiryLabel}</span>}
              </div>
            </div>
            <div className={classes.quotaMessage}>{creditsLabel}</div>
            <QuotaMeter percent={remainingPct} classes={classes} index={index} />
          </div>
        );
      })}
      {consoleLink}
    </>
  );
}
