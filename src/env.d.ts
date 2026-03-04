// Type declaration for import.meta.env (used by devtools code ported from Vite)
interface ImportMetaEnv {
	MODE: string;
	DEV: boolean;
	PROD: boolean;
	[key: string]: string | undefined;
}

interface ImportMeta {
	env: ImportMetaEnv;
}
