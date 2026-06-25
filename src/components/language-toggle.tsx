import { Button } from "#/components/ui/button";
import { useI18n, type AppLocale } from "#/lib/i18n";

const locales: AppLocale[] = ["zh-CN", "en"];

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="flex items-center gap-1 rounded-full border bg-background/80 p-1">
      {locales.map((item) => {
        const active = item === locale;

        return (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={active ? "default" : "ghost"}
            className="h-8 rounded-full px-3"
            onClick={() => setLocale(item)}
          >
            {t(`lang.${item}`)}
          </Button>
        );
      })}
    </div>
  );
}
