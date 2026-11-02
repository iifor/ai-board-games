/**
 * 更新资源时的 enabled 取值：省略表示保留数据库里的原值。
 * 不能默认为 true——模型可能因额度耗尽被系统停用，一次不带 enabled 的更新不该把它悄悄重新启用。
 */
export function enabledUpdate(input: { readonly enabled?: boolean | undefined }): { readonly enabled?: boolean } {
  return input.enabled === undefined ? {} : { enabled: input.enabled };
}
