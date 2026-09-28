import type { ProductLoginConfig } from "@insight/product-login-system";
import { ActusConnectLogo } from "@/components/auth/ActusConnectLogo";

export const actusConnectLoginConfig: ProductLoginConfig = {
  audience: "internal",
  productName: "Actus Connect",
  productTagline: "Relacionamento e entrada digital de demandas.",
  productDescription:
    "Aplicação operacional para acompanhamento e registro de demandas.\n\nUse suas credenciais de acesso para continuar.",
  productLogo: <ActusConnectLogo />,
  hero: { type: "placeholder" },
  accentClassName: "from-brand-primary/25",
  authTitle: "Acesso",
  authDescription: "Entre com e-mail e senha para acessar a aplicação.",
};

export const ACTUS_CONNECT_APP_VERSION = "1.0.0";
