export function getAppUserId() {
  return process.env.APP_USER_ID ?? "local-user";
}
