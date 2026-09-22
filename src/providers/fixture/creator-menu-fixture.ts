import {
  menuExtractionV2Schema,
  type MenuExtractionV2,
  type TargetLanguage,
} from "@/domain/menu/menu-extraction";

const translations: Record<
  TargetLanguage,
  {
    title: string;
    grilled: string;
    mackerel: string;
    mackerelDescription: string;
    noodles: string;
    udon: string;
    udonDescription: string;
    tea: string;
  }
> = {
  en: {
    title: "Evening menu",
    grilled: "From the grill",
    mackerel: "Miso-braised mackerel",
    mackerelDescription: "Mackerel slowly simmered with miso and ginger",
    noodles: "Noodles",
    udon: "Seasonal udon",
    udonDescription: "Udon with seasonal vegetables",
    tea: "Roasted green tea",
  },
  es: {
    title: "Menú de la noche",
    grilled: "De la parrilla",
    mackerel: "Caballa braseada con miso",
    mackerelDescription: "Caballa cocida lentamente con miso y jengibre",
    noodles: "Fideos",
    udon: "Udon de temporada",
    udonDescription: "Udon con verduras de temporada",
    tea: "Té verde tostado",
  },
  fr: {
    title: "Menu du soir",
    grilled: "Au gril",
    mackerel: "Maquereau braisé au miso",
    mackerelDescription: "Maquereau mijoté au miso et au gingembre",
    noodles: "Nouilles",
    udon: "Udon de saison",
    udonDescription: "Udon aux légumes de saison",
    tea: "Thé vert torréfié",
  },
  ja: {
    title: "晩ごはん",
    grilled: "焼き物",
    mackerel: "鯖の味噌煮",
    mackerelDescription: "味噌と生姜でじっくり煮込みました",
    noodles: "麺",
    udon: "季節のうどん",
    udonDescription: "季節の野菜を添えたうどん",
    tea: "ほうじ茶",
  },
  "zh-CN": {
    title: "晚餐菜单",
    grilled: "烧烤",
    mackerel: "味噌炖鲭鱼",
    mackerelDescription: "用味噌和生姜慢炖的鲭鱼",
    noodles: "面食",
    udon: "时令乌冬面",
    udonDescription: "配时令蔬菜的乌冬面",
    tea: "焙茶",
  },
};

export function createCreatorMenuFixture(
  targetLanguage: TargetLanguage,
): MenuExtractionV2 {
  const translated = translations[targetLanguage];
  return menuExtractionV2Schema.parse({
    schemaVersion: "2",
    sourceLanguage: "ja",
    targetLanguage,
    title: field("晩ごはん", translated.title, 0.99),
    sections: [
      {
        id: "grill",
        order: 0,
        title: field("焼き物", translated.grilled, 0.98),
        items: [
          {
            id: "mackerel",
            order: 0,
            name: field("鯖の味噌煮", translated.mackerel, 0.98),
            description: field(
              "味噌と生姜でじっくり煮込みました",
              translated.mackerelDescription,
              0.94,
            ),
            price: sourceField("¥1,280", 0.99),
            explicitSourceClaims: ["味噌", "生姜"],
            imageEligibility: "prepared_food",
          },
          {
            id: "tea",
            order: 1,
            name: field("ほうじ茶", translated.tea, 0.97),
            price: sourceField("¥480", 0.98),
            explicitSourceClaims: [],
            imageEligibility: "prepared_drink",
          },
        ],
      },
      {
        id: "noodles",
        order: 1,
        title: field("麺", translated.noodles, 0.99),
        items: [
          {
            id: "udon",
            order: 0,
            name: field("季節のうどん", translated.udon, 0.96),
            description: field(
              "季節の野菜を添えたうどん",
              translated.udonDescription,
              0.9,
            ),
            price: sourceField("¥9?0", 0.61, true),
            explicitSourceClaims: ["季節の野菜"],
            imageEligibility: "prepared_food",
          },
        ],
      },
    ],
    sourcePhotoCandidates: [
      {
        id: "photo-mackerel",
        region: {
          sourceFileOrder: 0,
          pageIndex: 0,
          x: 0.55,
          y: 0.08,
          width: 0.38,
          height: 0.3,
          confidence: 0.99,
          needsReview: false,
        },
        association: {
          itemId: "mackerel",
          confidence: 0.98,
          needsReview: false,
        },
        usability: {
          status: "usable",
          confidence: 0.94,
          needsReview: false,
        },
      },
      {
        id: "photo-ambiguous",
        region: {
          sourceFileOrder: 0,
          pageIndex: 0,
          x: 0.1,
          y: 0.62,
          width: 0.32,
          height: 0.25,
          confidence: 0.91,
          needsReview: false,
        },
        association: {
          itemId: null,
          confidence: 0.48,
          needsReview: true,
        },
        usability: {
          status: "uncertain",
          confidence: 0.67,
          needsReview: true,
        },
      },
    ],
  });
}

function field(
  sourceText: string,
  translatedText: string,
  confidence: number,
  needsReview = false,
) {
  return { sourceText, translatedText, confidence, needsReview };
}

function sourceField(
  sourceText: string,
  confidence: number,
  needsReview = false,
) {
  return { sourceText, confidence, needsReview };
}
