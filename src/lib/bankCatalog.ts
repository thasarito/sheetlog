export type BankInstitution = {
  id: string;
  name: string;
  mark: string;
  color: string;
  aliases: readonly string[];
};

export type CountryBankCatalog = {
  code: string;
  name: string;
  currency: string;
  banks: readonly BankInstitution[];
};

type BankTuple = readonly [string, string, string, string, readonly string[]];
type CountryTupleData = {
  name: string;
  currency: string;
  banks: readonly BankTuple[];
};

const COUNTRY_DATA = {"TH":{"name":"Thailand","currency":"THB","banks":[["kbank","KBank","K","#138a56",["kasikorn","kasikornbank","กสิกร","กสิกรไทย"]],["scb","SCB","SCB","#5f2a86",["siam commercial bank","ไทยพาณิชย์"]],["krungthai","Krungthai","KTB","#12a7e0",["ktb","กรุงไทย"]],["bangkok-bank","Bangkok Bank","B","#173d8f",["bbl","กรุงเทพ"]],["krungsri","Krungsri","K","#f2b91f",["bank of ayudhya","bay","กรุงศรี"]],["ttb","ttb","ttb","#f26b21",["tmbthanachart","tmb","ธนชาต"]],["uob-th","UOB","UOB","#1c398e",["united overseas bank"]],["gsb","GSB","GSB","#e7499a",["government savings bank","ออมสิน"]]]},"US":{"name":"United States","currency":"USD","banks":[["chase","Chase","C","#135ea8",["jpmorgan chase","jp morgan"]],["bank-of-america","Bank of America","BofA","#c52026",["bofa"]],["wells-fargo","Wells Fargo","WF","#b31b34",[]],["citi","Citi","Citi","#056dae",["citibank"]],["capital-one","Capital One","C1","#9b1b30",[]],["us-bank","U.S. Bank","USB","#233f8c",[]],["pnc","PNC","PNC","#e16a24",[]],["td-us","TD Bank","TD","#16854a",[]]]},"GB":{"name":"United Kingdom","currency":"GBP","banks":[["monzo","Monzo","M","#ff4f64",[]],["barclays","Barclays","B","#00aEEF",[]],["lloyds","Lloyds","L","#006a4d",[]],["natwest","NatWest","NW","#42145f",[]],["hsbc-uk","HSBC","HSBC","#db0011",[]],["starling","Starling","S","#5d21d2",[]],["santander-uk","Santander","S","#ec0000",[]],["halifax","Halifax","H","#0046a8",[]]]},"JP":{"name":"Japan","currency":"JPY","banks":[["mufg","MUFG Bank","MUFG","#d71920",["mitsubishi ufj"]],["smbc","SMBC","SMBC","#0a8f3c",["sumitomo mitsui"]],["mizuho","Mizuho","M","#1a2f86",[]],["japan-post","Japan Post Bank","JP","#1c6cb3",["ゆうちょ"]],["rakuten-bank","Rakuten Bank","R","#bf0000",[]],["sbi-net","SBI Sumishin Net","SBI","#1c398e",[]],["resona","Resona","R","#159447",[]],["sony-bank","Sony Bank","S","#222222",[]]]},"SG":{"name":"Singapore","currency":"SGD","banks":[["dbs","DBS","DBS","#d71920",[]],["ocbc","OCBC","OCBC","#e11b22",[]],["uob-sg","UOB","UOB","#183883",[]],["standard-chartered-sg","Standard Chartered","SC","#00a796",[]],["hsbc-sg","HSBC","HSBC","#db0011",[]],["maybank-sg","Maybank","M","#f7c600",[]],["trust-bank-sg","Trust Bank","T","#5b2cff",[]],["cimb-sg","CIMB","C","#c82127",[]]]},"AU":{"name":"Australia","currency":"AUD","banks":[["commbank","CommBank","CBA","#f9c400",["commonwealth bank"]],["westpac","Westpac","W","#d5002b",[]],["anz","ANZ","ANZ","#0072ac",[]],["nab","NAB","NAB","#c8102e",[]],["macquarie","Macquarie","M","#222222",[]],["ing-au","ING","ING","#ff6200",[]],["bendigo","Bendigo Bank","B","#8a1538",[]],["up-bank","Up","UP","#ff5c35",[]]]},"CA":{"name":"Canada","currency":"CAD","banks":[["rbc","RBC","RBC","#006ac3",[]],["td-ca","TD Canada Trust","TD","#138a42",[]],["scotiabank","Scotiabank","S","#ec111a",[]],["bmo","BMO","BMO","#0075be",[]],["cibc","CIBC","CIBC","#8b1d41",[]],["national-bank-ca","National Bank","NB","#e31837",[]],["desjardins","Desjardins","D","#00874e",[]],["tangerine","Tangerine","T","#f58220",[]]]},"DE":{"name":"Germany","currency":"EUR","banks":[["deutsche-bank","Deutsche Bank","DB","#0018a8",[]],["commerzbank","Commerzbank","C","#ffcc00",[]],["sparkasse","Sparkasse","S","#e30613",[]],["n26","N26","N26","#36a18b",[]],["dkb","DKB","DKB","#009bd6",[]],["ing-de","ING","ING","#ff6200",[]],["comdirect","comdirect","c","#f7b500",[]],["volksbank","Volksbank","V","#005ca9",[]]]},"FR":{"name":"France","currency":"EUR","banks":[["bnp-paribas","BNP Paribas","BNP","#00965e",[]],["credit-agricole","Crédit Agricole","CA","#007a53",[]],["societe-generale","Société Générale","SG","#e50a30",[]],["credit-mutuel","Crédit Mutuel","CM","#005ca9",[]],["banque-postale","La Banque Postale","LBP","#003b7a",[]],["boursobank","BoursoBank","B","#f16e00",["boursorama"]],["caisse-epargne","Caisse d’Épargne","CE","#d71920",[]],["lcl","LCL","LCL","#0067a8",[]]]},"IN":{"name":"India","currency":"INR","banks":[["sbi","State Bank of India","SBI","#1f6db3",[]],["hdfc","HDFC Bank","HDFC","#123c69",[]],["icici","ICICI Bank","ICICI","#f58220",[]],["axis","Axis Bank","A","#97144d",[]],["kotak","Kotak Mahindra","K","#e31837",[]],["bank-of-baroda","Bank of Baroda","BOB","#f26522",[]],["pnb","Punjab National Bank","PNB","#8a1538",[]],["indusind","IndusInd Bank","I","#8b1d41",[]]]},"ID":{"name":"Indonesia","currency":"IDR","banks":[["bca","BCA","BCA","#1268ad",[]],["bri","BRI","BRI","#00529c",[]],["mandiri","Bank Mandiri","M","#003d79",[]],["bni","BNI","BNI","#f15a24",[]],["cimb-niaga","CIMB Niaga","C","#c82127",[]],["permata","PermataBank","P","#1c9ad6",[]],["danamon","Danamon","D","#f58220",[]],["jago","Bank Jago","J","#f6c900",[]]]},"MY":{"name":"Malaysia","currency":"MYR","banks":[["maybank-my","Maybank","M","#f7c600",[]],["cimb-my","CIMB","C","#c82127",[]],["public-bank","Public Bank","PB","#d71920",[]],["rhb","RHB","RHB","#0067a8",[]],["hong-leong","Hong Leong Bank","HL","#8b1d41",[]],["ambank","AmBank","A","#e31837",[]],["bank-islam","Bank Islam","BI","#6a1b9a",[]],["uob-my","UOB","UOB","#1c398e",[]]]},"PH":{"name":"Philippines","currency":"PHP","banks":[["bdo","BDO","BDO","#003b7a",[]],["bpi","BPI","BPI","#b31b34",[]],["metrobank","Metrobank","M","#00529c",[]],["landbank","LandBank","LB","#0a8f3c",[]],["unionbank-ph","UnionBank","UB","#f58220",[]],["security-bank","Security Bank","SB","#0067a8",[]],["rcbc","RCBC","RCBC","#005ca9",[]],["chinabank-ph","China Bank","CB","#d71920",[]]]},"VN":{"name":"Vietnam","currency":"VND","banks":[["vietcombank","Vietcombank","VCB","#00874e",[]],["bidv","BIDV","BIDV","#00529c",[]],["vietinbank","VietinBank","VTB","#0072ac",[]],["agribank","Agribank","A","#8a1538",[]],["techcombank","Techcombank","TCB","#e31837",[]],["mb-bank","MB Bank","MB","#123c69",[]],["acb-vn","ACB","ACB","#0067a8",[]],["vpbank","VPBank","VP","#16854a",[]]]},"KR":{"name":"South Korea","currency":"KRW","banks":[["kb-kookmin","KB Kookmin","KB","#f4b400",[]],["shinhan","Shinhan Bank","S","#0067a8",[]],["hana","Hana Bank","H","#009490",[]],["woori","Woori Bank","W","#1c6cb3",[]],["nh-nonghyup","NH NongHyup","NH","#16854a",[]],["kakao-bank","KakaoBank","K","#f7c600",[]],["toss-bank","Toss Bank","T","#3182f6",[]],["ibk","IBK","IBK","#00529c",[]]]},"CN":{"name":"China","currency":"CNY","banks":[["icbc","ICBC","ICBC","#c82127",[]],["ccb","China Construction Bank","CCB","#00529c",[]],["abc-cn","Agricultural Bank of China","ABC","#00874e",[]],["bank-of-china","Bank of China","BOC","#8b1d41",[]],["cmb-cn","China Merchants Bank","CMB","#e31837",[]],["bocom","Bank of Communications","BCM","#003b7a",[]],["psbc","Postal Savings Bank","PSBC","#16854a",[]],["citic-cn","China CITIC Bank","CITIC","#c52026",[]]]},"AE":{"name":"United Arab Emirates","currency":"AED","banks":[["emirates-nbd","Emirates NBD","ENBD","#d71920",[]],["adcb","ADCB","ADCB","#00529c",[]],["fab","First Abu Dhabi Bank","FAB","#007a53",[]],["mashreq","Mashreq","M","#e31837",[]],["dib","Dubai Islamic Bank","DIB","#16854a",[]],["adib","ADIB","ADIB","#8a1538",[]],["rakbank","RAKBANK","RAK","#f58220",[]],["hsbc-ae","HSBC","HSBC","#db0011",[]]]},"BR":{"name":"Brazil","currency":"BRL","banks":[["itau","Itaú","I","#f58220",[]],["bradesco","Bradesco","B","#cc092f",[]],["banco-do-brasil","Banco do Brasil","BB","#f7c600",[]],["caixa","Caixa","C","#0067a8",[]],["nubank","Nubank","Nu","#820ad1",[]],["santander-br","Santander","S","#ec0000",[]],["inter-br","Banco Inter","I","#ff7a00",[]],["c6-bank","C6 Bank","C6","#222222",[]]]},"MX":{"name":"Mexico","currency":"MXN","banks":[["bbva-mx","BBVA","BBVA","#004481",[]],["banorte","Banorte","B","#d71920",[]],["santander-mx","Santander","S","#ec0000",[]],["citibanamex","Citibanamex","C","#056dae",[]],["hsbc-mx","HSBC","HSBC","#db0011",[]],["scotiabank-mx","Scotiabank","S","#ec111a",[]],["banco-azteca","Banco Azteca","BA","#16854a",[]],["inbursa","Inbursa","I","#1c398e",[]]]},"CH":{"name":"Switzerland","currency":"CHF","banks":[["ubs","UBS","UBS","#e31837",[]],["raiffeisen-ch","Raiffeisen","R","#e11b22",[]],["postfinance","PostFinance","PF","#f7c600",[]],["zuercher-kb","Zürcher Kantonalbank","ZKB","#00529c",[]],["credit-suisse","Credit Suisse","CS","#123c69",[]],["neon","neon","N","#512bd4",[]],["yuh","Yuh","Y","#d84cff",[]],["bcv","BCV","BCV","#0067a8",[]]]}} as const satisfies Record<string, CountryTupleData>;
const TIMEZONE_COUNTRY = {"Asia/Bangkok":"TH","America/New_York":"US","America/Chicago":"US","America/Denver":"US","America/Los_Angeles":"US","Europe/London":"GB","Asia/Tokyo":"JP","Asia/Singapore":"SG","Australia/Sydney":"AU","Australia/Melbourne":"AU","America/Toronto":"CA","Europe/Berlin":"DE","Europe/Paris":"FR","Asia/Kolkata":"IN","Asia/Jakarta":"ID","Asia/Kuala_Lumpur":"MY","Asia/Manila":"PH","Asia/Ho_Chi_Minh":"VN","Asia/Seoul":"KR","Asia/Shanghai":"CN","Asia/Dubai":"AE","America/Sao_Paulo":"BR","America/Mexico_City":"MX","Europe/Zurich":"CH"} as const satisfies Record<string, string>;

const COUNTRY_CATALOGS: Record<string, CountryBankCatalog> = Object.fromEntries(
  Object.entries(COUNTRY_DATA).map(([code, country]) => [
    code,
    {
      code,
      name: country.name,
      currency: country.currency,
      banks: country.banks.map(([id, name, mark, color, aliases]) => ({
        id,
        name,
        mark,
        color,
        aliases,
      })),
    },
  ]),
);

export const SUPPORTED_COUNTRY_CODES = Object.freeze(Object.keys(COUNTRY_CATALOGS));
export const SUPPORTED_CURRENCIES = Object.freeze(
  [...new Set(Object.values(COUNTRY_CATALOGS).map((catalog) => catalog.currency))].sort(),
);

function supportedCountry(code: string | undefined | null): string | null {
  const normalized = code?.trim().toUpperCase();
  return normalized && COUNTRY_CATALOGS[normalized] ? normalized : null;
}

function regionFromLocale(locale: string): string | null {
  try {
    return supportedCountry(new Intl.Locale(locale).region);
  } catch {
    const match = locale.match(/[-_]([A-Za-z]{2})(?:$|[-_])/);
    return supportedCountry(match?.[1]);
  }
}

export function detectBankCountry(
  locales: readonly string[],
  timezone?: string | null,
): string {
  const timezoneCountry = supportedCountry(
    timezone ? TIMEZONE_COUNTRY[timezone as keyof typeof TIMEZONE_COUNTRY] : null,
  );
  if (timezoneCountry) return timezoneCountry;
  for (const locale of locales) {
    const region = regionFromLocale(locale);
    if (region) return region;
  }
  return "TH";
}

export function getCountryCatalog(code: string): CountryBankCatalog {
  return COUNTRY_CATALOGS[supportedCountry(code) ?? "TH"];
}

function normalizedSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type BankSearchResult = {
  countryCode: string;
  countryName: string;
  currency: string;
  bank: BankInstitution;
};

export function searchBankCatalog(
  query: string,
  preferredCountryCode?: string | null,
): BankSearchResult[] {
  const normalizedQuery = normalizedSearchText(query);
  if (!normalizedQuery) return [];
  const preferred = supportedCountry(preferredCountryCode);
  const results: BankSearchResult[] = [];
  for (const catalog of Object.values(COUNTRY_CATALOGS)) {
    for (const bank of catalog.banks) {
      const haystack = normalizedSearchText(
        [bank.id, bank.name, ...bank.aliases, catalog.code, catalog.name].join(" "),
      );
      if (haystack.includes(normalizedQuery)) {
        results.push({
          countryCode: catalog.code,
          countryName: catalog.name,
          currency: catalog.currency,
          bank,
        });
      }
    }
  }
  return results
    .sort((left, right) => {
      const leftPreferred = left.countryCode === preferred ? 0 : 1;
      const rightPreferred = right.countryCode === preferred ? 0 : 1;
      return (
        leftPreferred - rightPreferred ||
        left.bank.name.localeCompare(right.bank.name)
      );
    })
    .slice(0, 40);
}
