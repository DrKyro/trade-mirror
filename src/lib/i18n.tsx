import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppLocale = "zh-CN" | "en";

type Dictionary = Record<string, string>;
type TranslationValues = Record<string, number | string>;

const LOCALE_STORAGE_KEY = "trader-platform-locale";

const dictionaries: Record<AppLocale, Dictionary> = {
  "zh-CN": {
    "app.name": "跟单镜像",
    "app.tagline": "交易员监控与跟单执行平台",
    "app.description": "合并 traderSpy 与 FollowTraderManager 后的统一交易平台。",
    "common.or": "或",
    "common.email": "邮箱",
    "common.password": "密码",
    "common.name": "名称",
    "common.role": "角色",
    "common.save": "保存",
    "common.delete": "删除",
    "common.optional": "可选",
    "common.empty": "空",
    "common.saved": "已保存",
    "common.loading": "加载中...",
    "common.retry": "重试",
    "common.home": "首页",
    "common.goBack": "返回",
    "common.currentSession": "当前会话",
    "common.platform": "平台",
    "common.link": "链接",
    "common.user": "普通用户",
    "common.admin": "管理员",
    "common.adding": "添加中...",
    "common.saving": "保存中...",
    "common.notFound": "你访问的页面不存在。",
    "common.toggleTheme": "切换主题",
    "common.light": "浅色",
    "common.dark": "深色",
    "common.system": "跟随系统",
    "common.language": "语言",
    "lang.zh-CN": "中文",
    "lang.en": "EN",
    "error.tryAgain": "再试一次",
    "error.signInFailed": "登录时发生错误。",
    "error.signUpFailed": "注册时发生错误。",
    "error.passwordMismatch": "两次输入的密码不一致。",
    "error.socialSignIn": "{provider} 登录时发生错误。",
    "landing.badge": "TanStack Start 迁移版",
    "landing.title": "交易平台已经整合 trader spy 与 follow-manager 的核心工作流",
    "landing.description":
      "我们正在基于 `mugnavo/tanstarter` 重建旧的监控与跟单系统，在保留核心能力的同时，用类型化的 TanStack Start 应用替代旧的 Nuxt + Node 分离架构。",
    "landing.signIn": "登录",
    "landing.createAccount": "创建账号",
    "auth.loginTitle": "欢迎回来",
    "auth.loginSubmit": "登录",
    "auth.loginSubmitting": "登录中...",
    "auth.signupTitle": "创建新账号",
    "auth.signupSubmit": "注册",
    "auth.signupSubmitting": "注册中...",
    "auth.noAccount": "还没有账号？",
    "auth.hasAccount": "已经有账号了？",
    "auth.goSignup": "去注册",
    "auth.goLogin": "去登录",
    "auth.confirmPassword": "确认密码",
    "auth.passwordPlaceholder": "请输入密码",
    "auth.confirmPasswordPlaceholder": "请再次输入密码",
    "auth.namePlaceholder": "请输入姓名",
    "auth.emailPlaceholder": "hello@example.com",
    "auth.signOut": "退出登录",
    "auth.loginWith": "使用 {provider} 登录",
    "auth.guestRedirect": "游客入口",
    "nav.strategies": "策略",
    "nav.strategyBoard": "策略看板",
    "nav.messages": "消息",
    "nav.teachers": "交易员",
    "nav.system": "系统",
    "nav.users": "用户",
    "nav.logs": "日志",
    "dashboard.badge": "迁移工作台",
    "dashboard.title": "统一的交易员监控与跟单执行平台",
    "dashboard.description":
      "这个新应用是旧 trader spy 服务与 FollowTraderManager 管理后台的合并承接点。现在平台围绕共享类型模型、Server Functions 和现代 React 路由重建。",
    "dashboard.openStrategies": "进入策略页",
    "dashboard.openStrategyBoard": "进入策略看板",
    "dashboard.openMessages": "进入消息页",
    "dashboard.openTeachers": "进入交易员页",
    "dashboard.openSystem": "查看系统状态",
    "dashboard.targets": "当前迁移目标",
    "dashboard.target1": "把 traderSpy 的监控能力迁入类型化服务模块。",
    "dashboard.target2": "把 FollowTraderManager 的风控与执行规则迁入新平台。",
    "dashboard.target3": "用 TanStack Start 路由重建策略、交易员与系统页面。",
    "dashboard.target4": "用 Server Functions 与 Query 数据流替代零散本地状态。",
    "dashboard.target5": "把旧用户管理迁到统一的 Better Auth 用户体系。",
    "dashboard.guideTitle": "怎么使用这个系统",
    "dashboard.guide1": "先到“策略”页维护要跟踪的交易员。",
    "dashboard.guide2": "再到“交易员”页维护跟单账户、关系和执行参数。",
    "dashboard.guide3": "“策略看板”查看策略表现与跟单分析。",
    "dashboard.guide4": "“消息”页查看 MsgBack 消息流与链上信息。",
    "dashboard.guide5": "“系统”页查看运行状态、调度器和通知配置。",
    "dashboard.guide6": "管理员还能用“用户”和“日志”页做后台维护。",
    "users.title": "用户管理",
    "users.description":
      "这里只允许管理员访问。该页面已经从旧 FollowTraderManager 后台迁移到新的 Better Auth 用户体系。",
    "users.createHint": "直接在统一认证库中创建用户，并指定系统内使用的角色。",
    "users.createUser": "创建用户",
    "users.total": "统一认证库中共有 {count} 个用户",
    "users.resetPassword": "重置密码",
    "users.saveProfile": "保存资料",
    "users.setPassword": "设置密码",
    "users.deleteUser": "删除用户",
    "messages.title": "消息中心",
    "messages.description": "查看旧 MsgBack 消息流、链上活动和当前用户的账户设置。",
    "messages.count": "消息数",
    "messages.chainCount": "链上条目",
    "messages.binanceKey": "Binance API Key",
    "messages.tab.messages": "消息",
    "messages.tab.chain": "链上",
    "messages.tab.account": "账户",
    "messages.translation": "译文",
    "messages.saveAccount": "保存账户设置",
    "messages.accountSaved": "已保存",
    "strategies.title": "策略",
    "strategies.description":
      "当前登录用户的策略工作区建立在共享交易员池之上。实时抓取与执行仍然是全局能力，但这里保留每个用户自己的可见范围与操作入口。",
    "teachers.title": "交易员账户",
    "teachers.description":
      "这里管理从旧 Nuxt 后台迁移来的交易员跟单账户，并保留我们在重构后仍然需要的跟单关系与 trace trader 配置模型。",
    "strategyBoard.title": "策略看板",
    "strategyBoard.description":
      "在 TanStarter 内重建的内部策略分析板，融合了 FollowTraderManager 的策略视图和合并后的跟单运行时。",
    "system.title": "系统状态",
    "system.description":
      "查看合并后运行时的整体状态，包括抓取健康度、调度器、事件流以及市场订阅图。",
    "logs.title": "日志浏览",
    "logs.description":
      "浏览新平台和旧 FollowTraderManager 目录下的日志文件，补充系统页里的结构化运行事件。",
    "logs.total": "{count} 个日志文件",
    "logs.noSelected": "尚未选择日志文件",
    "logs.noContent": "尚未加载日志内容。",
    "form.addTeacher": "新增交易员账户",
    "form.teacherId": "交易员 ID",
    "form.executionMode": "执行模式",
    "form.apiKey": "API Key",
    "form.apiSecret": "API Secret",
    "form.apiPassword": "API 密码",
    "form.addTeacherSubmitting": "添加中...",
    "form.addTraderHint":
      "一步把交易员加入共享运行时，并关联到当前用户工作区。链接可选，留空时会按平台和交易员 ID 自动推断。",
    "form.addTrader": "加入我的工作区",
    "form.traderId": "交易员 ID",
    "form.followRelationInvalid": "跟单关系 JSON 无效。",
    "form.followRelationArray": "跟单关系 JSON 必须是数组。",
    "form.followRelationEditor": "手动编辑跟单关系",
    "form.followRelationSaveFailed": "更新跟单关系失败。",
    "form.updateRelations": "更新关系",
    "form.addStrategyToFollow": "添加要跟随的策略",
    "form.allTradersConfigured": "所有交易员都已经配置过了",
    "form.selectTrader": "请选择交易员",
    "form.followTrader": "开始跟随",
    "form.funds": "跟单资金",
    "form.orderMode": "下单模式",
    "form.fixedFunds": "固定资金",
    "form.traceRatio": "跟单比例",
    "form.stopLossUsdt": "止损 USDT",
    "form.stopLossRate": "止损比例",
    "form.followStatus": "跟随状态",
    "form.saveStrategySettings": "保存策略设置",
    "form.modeRatio": "按比例",
    "form.modeFixed": "固定金额",
    "form.statusFollowing": "跟随中",
    "form.statusUnfollow": "停止跟随",
    "route.forbidden": "无权限访问",
    "teacherLogs.description": "Trader {teacherId} 的专属日志查看页。",
    "teacherLogs.fileCount": "{teacherId} 共有 {count} 个日志文件",
    "teacherLogs.noLogs": "没有找到该交易员的日志文件。",
    "about.title": "关于",
    "about.description": "基于 TanStarter 构建的合并交易员工作台。",
  },
  en: {
    "app.name": "TradeMirror",
    "app.tagline": "Trader monitoring and follow execution platform",
    "app.description": "Unified platform after merging traderSpy and FollowTraderManager.",
    "common.or": "Or",
    "common.email": "Email",
    "common.password": "Password",
    "common.name": "Name",
    "common.role": "Role",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.optional": "Optional",
    "common.empty": "Empty",
    "common.saved": "Saved",
    "common.loading": "Loading...",
    "common.retry": "Try Again",
    "common.home": "Home",
    "common.goBack": "Go Back",
    "common.currentSession": "current session",
    "common.platform": "Platform",
    "common.link": "Link",
    "common.user": "User",
    "common.admin": "Admin",
    "common.adding": "Adding...",
    "common.saving": "Saving...",
    "common.notFound": "The page you are looking for does not exist.",
    "common.toggleTheme": "Toggle theme",
    "common.light": "Light",
    "common.dark": "Dark",
    "common.system": "System",
    "common.language": "Language",
    "lang.zh-CN": "中文",
    "lang.en": "EN",
    "error.tryAgain": "Try Again",
    "error.signInFailed": "An error occurred while signing in.",
    "error.signUpFailed": "An error occurred while signing up.",
    "error.passwordMismatch": "Passwords do not match.",
    "error.socialSignIn": "An error occurred during {provider} sign-in.",
    "landing.badge": "TanStack Start migration",
    "landing.title":
      "Trader Platform is the new merged home for trader spy and follow-manager workflows",
    "landing.description":
      "We are rebuilding the legacy monitoring and follow-trading stack on top of `mugnavo/tanstarter`, preserving every major capability while replacing the old Nuxt + Node split with a typed TanStack Start application.",
    "landing.signIn": "Sign in",
    "landing.createAccount": "Create account",
    "auth.loginTitle": "Welcome back",
    "auth.loginSubmit": "Login",
    "auth.loginSubmitting": "Logging in...",
    "auth.signupTitle": "Create your account",
    "auth.signupSubmit": "Sign up",
    "auth.signupSubmitting": "Signing up...",
    "auth.noAccount": "Don't have an account?",
    "auth.hasAccount": "Already have an account?",
    "auth.goSignup": "Sign up",
    "auth.goLogin": "Login",
    "auth.confirmPassword": "Confirm Password",
    "auth.passwordPlaceholder": "Enter password here",
    "auth.confirmPasswordPlaceholder": "Confirm Password",
    "auth.namePlaceholder": "John Doe",
    "auth.emailPlaceholder": "hello@example.com",
    "auth.signOut": "Sign out",
    "auth.loginWith": "Login with {provider}",
    "auth.guestRedirect": "Guest entry",
    "nav.strategies": "Strategies",
    "nav.strategyBoard": "Strategy Board",
    "nav.messages": "Messages",
    "nav.teachers": "Traders",
    "nav.system": "System",
    "nav.users": "Users",
    "nav.logs": "Logs",
    "dashboard.badge": "Migration Workspace",
    "dashboard.title": "Unified trader monitoring and follow execution platform",
    "dashboard.description":
      "This new app is the merge target for the legacy trader spy service and the FollowTraderManager dashboard. The platform is being rebuilt around a shared typed domain model, server functions, and modern React routes.",
    "dashboard.openStrategies": "Open strategies",
    "dashboard.openStrategyBoard": "Open strategy board",
    "dashboard.openMessages": "Open messages",
    "dashboard.openTeachers": "Open traders",
    "dashboard.openSystem": "Open system status",
    "dashboard.targets": "Migration targets",
    "dashboard.target1": "Port traderSpy monitoring capabilities into typed service modules.",
    "dashboard.target2": "Port risk control and execution rules from FollowTraderManager.",
    "dashboard.target3": "Rebuild strategy, trader, and system pages with TanStack Start routes.",
    "dashboard.target4": "Replace ad-hoc local state with server functions and query-backed flows.",
    "dashboard.target5": "Move legacy user management onto the unified Better Auth user store.",
    "dashboard.guideTitle": "How to use the system",
    "dashboard.guide1": "Manage the traders you want to track on the Strategies page.",
    "dashboard.guide2":
      "Manage follow accounts, relations, and execution settings on the Traders page.",
    "dashboard.guide3": "Review strategy performance and analytics on the Strategy Board.",
    "dashboard.guide4": "Read MsgBack feeds and chain information on the Messages page.",
    "dashboard.guide5":
      "Check runtime health, scheduler status, and notifications on the System page.",
    "dashboard.guide6":
      "Admins can also maintain users and inspect logs from the Users and Logs pages.",
    "users.title": "Users",
    "users.description":
      "Admin-only user management migrated from the legacy FollowTraderManager dashboard onto the Better Auth user store.",
    "users.createHint":
      "Create users directly in the unified auth store and assign their application role.",
    "users.createUser": "Create user",
    "users.total": "{count} users in unified auth store",
    "users.resetPassword": "Reset Password",
    "users.saveProfile": "Save profile",
    "users.setPassword": "Set password",
    "users.deleteUser": "Delete user",
    "messages.title": "Messages",
    "messages.description":
      "Merged runtime view for the legacy MsgBack feed, chain activity, and per-user account settings.",
    "messages.count": "Messages",
    "messages.chainCount": "Chain items",
    "messages.binanceKey": "Binance API key",
    "messages.tab.messages": "Messages",
    "messages.tab.chain": "Chain",
    "messages.tab.account": "Account",
    "messages.translation": "Translation",
    "messages.saveAccount": "Save account",
    "messages.accountSaved": "saved",
    "strategies.title": "Strategies",
    "strategies.description":
      "Current user strategy workspace backed by the shared trader pool. Live trader data stays global for ingest and execution, while this page preserves per-user visibility and actions.",
    "teachers.title": "Traders",
    "teachers.description":
      "Trader follow accounts migrated from the legacy Nuxt dashboard, keeping the shared follow relation and trace trader model used in the refactor.",
    "strategyBoard.title": "Strategy Board",
    "strategyBoard.description":
      "Internal strategy analytics board rebuilt inside TanStarter from FollowTraderManager strategy views and the merged follow runtime.",
    "system.title": "System",
    "system.description":
      "Operational status for the merged runtime, including ingest health, scheduler state, event flow, and market subscriptions.",
    "logs.title": "Logs",
    "logs.description":
      "File-based log browser for both the new merged app and the legacy FollowTraderManager logs directory.",
    "logs.total": "{count} log files",
    "logs.noSelected": "No log selected",
    "logs.noContent": "No log content loaded.",
    "form.addTeacher": "Add trader",
    "form.teacherId": "Trader ID",
    "form.executionMode": "Execution mode",
    "form.apiKey": "API Key",
    "form.apiSecret": "API Secret",
    "form.apiPassword": "API Password",
    "form.addTeacherSubmitting": "Adding...",
    "form.addTraderHint":
      "Add a trader into the shared runtime and link it to the current user workspace in one step. Link is optional and will be inferred from platform + trader ID when omitted.",
    "form.addTrader": "Add to my workspace",
    "form.traderId": "Trader ID",
    "form.followRelationInvalid": "Follow relation JSON is invalid.",
    "form.followRelationArray": "Follow relation JSON must be an array.",
    "form.followRelationEditor": "Manual follow relation editor",
    "form.followRelationSaveFailed": "Failed to update follow relations.",
    "form.updateRelations": "Update relations",
    "form.addStrategyToFollow": "Add strategy to follow",
    "form.allTradersConfigured": "All traders already configured",
    "form.selectTrader": "Select a trader",
    "form.followTrader": "Follow trader",
    "form.funds": "Funds",
    "form.orderMode": "Order mode",
    "form.fixedFunds": "Fixed funds",
    "form.traceRatio": "Trace ratio",
    "form.stopLossUsdt": "Stop loss USDT",
    "form.stopLossRate": "Stop loss rate",
    "form.followStatus": "Follow status",
    "form.saveStrategySettings": "Save strategy settings",
    "form.modeRatio": "Ratio",
    "form.modeFixed": "Fixed",
    "form.statusFollowing": "Following",
    "form.statusUnfollow": "Unfollow",
    "route.forbidden": "Forbidden",
    "teacherLogs.description": "Dedicated log viewer for trader {teacherId}.",
    "teacherLogs.fileCount": "{teacherId}: {count} log files",
    "teacherLogs.noLogs": "No log files found for this trader.",
    "about.title": "About",
    "about.description": "Merged trader workspace built on TanStarter.",
  },
};

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, values?: TranslationValues) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function formatMessage(template: string, values?: TranslationValues) {
  if (!values) {
    return template;
  }

  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function I18nProvider(props: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("zh-CN");

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "zh-CN" || stored === "en") {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, values?: TranslationValues) => {
      const template =
        dictionaries[locale][key] ?? dictionaries.en[key] ?? dictionaries["zh-CN"][key] ?? key;
      return formatMessage(template, values);
    };

    return {
      locale,
      setLocale: setLocaleState,
      t,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function translate(key: string, locale: AppLocale = "zh-CN", values?: TranslationValues) {
  const template =
    dictionaries[locale][key] ?? dictionaries.en[key] ?? dictionaries["zh-CN"][key] ?? key;
  return formatMessage(template, values);
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider.");
  }

  return context;
}
