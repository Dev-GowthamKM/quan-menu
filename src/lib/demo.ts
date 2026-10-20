import type { Dish, MenuData } from "./types";

/** Example stall shown in demo mode and at /m/demo. Marked as an example in the UI. */
export const EXAMPLE_DISHES: Dish[] = [
 {vi:"Cơm tấm sườn bì chả",price:45000,spice:0,alg:["pork","egg","fish"],pron:"gum tum soo-un bee chah",special:true,
  name:{en:"Broken rice with grilled pork chop",ko:"숯불 돼지갈비 껌땀",zh:"烤猪排碎米饭",ja:"焼き豚のせコムタム"},
  desc:{en:"Charcoal-grilled lemongrass pork chop on broken rice, with shredded pork skin, egg meatloaf and sweet fish sauce.",ko:"레몬그라스 숯불 돼지갈비와 싸라기 쌀밥, 돼지껍데기채, 계란찜을 느억맘 소스와 함께.",zh:"炭烤香茅猪排配碎米饭，搭配猪皮丝、蛋肉饼和甜鱼露。",ja:"レモングラス風味の炭火焼き豚を砕き米ご飯に。豚皮の細切り、卵蒸し、甘いヌクマム付き。"}},
 {vi:"Bánh mì thịt",price:25000,spice:1,alg:["gluten","egg","pork","soy"],pron:"bun mee tit",
  name:{en:"Pork bánh mì sandwich",ko:"돼지고기 반미",zh:"猪肉法棍三明治",ja:"豚肉バインミー"},
  desc:{en:"Crispy baguette with cold cuts, pâté, mayonnaise, pickled carrot, cucumber, cilantro and chili.",ko:"바삭한 바게트에 햄, 파테, 마요네즈, 절인 당근, 오이, 고수, 고추.",zh:"酥脆法棍夹冷切肉、肝酱、蛋黄酱、腌胡萝卜、黄瓜、香菜和辣椒。",ja:"パリパリのバゲットにハム、パテ、マヨネーズ、なます、きゅうり、パクチー、唐辛子。"}},
 {vi:"Bún thịt nướng",price:40000,spice:0,alg:["pork","peanut","fish"],pron:"boon tit noo-ung",
  name:{en:"Grilled pork vermicelli bowl",ko:"숯불 돼지고기 비빔 쌀국수",zh:"烤肉米线",ja:"焼き豚のブン"},
  desc:{en:"Cold rice noodles with grilled pork, fresh herbs, crushed peanuts and fish sauce dressing.",ko:"차가운 쌀국수에 구운 돼지고기, 허브, 땅콩가루, 느억맘 소스.",zh:"凉米线配烤猪肉、新鲜香草、花生碎和鱼露汁。",ja:"冷たい米麺に焼き豚、ハーブ、砕いたピーナッツ、ヌクマムだれ。"}},
 {vi:"Phở bò tái",price:55000,spice:0,alg:["beef","fish"],pron:"fuh baw tie",
  name:{en:"Rare beef phở",ko:"소고기 쌀국수 (레어)",zh:"生牛肉河粉",ja:"レア牛肉のフォー"},
  desc:{en:"Slow-simmered beef broth with rice noodles and thin slices of rare beef, served with herbs and lime.",ko:"오래 끓인 소고기 육수에 쌀국수와 얇게 썬 레어 소고기, 허브와 라임 곁들임.",zh:"慢熬牛骨汤配河粉和薄切生牛肉，附香草和青柠。",ja:"じっくり煮込んだ牛骨スープに米麺と薄切りレア牛肉。ハーブとライム添え。"}},
 {vi:"Hủ tiếu Nam Vang",price:50000,spice:0,alg:["pork","shellfish","egg","fish"],pron:"hoo tee-oo nahm vahng",
  name:{en:"Phnom Penh-style noodle soup",ko:"프놈펜식 쌀국수 (후띠우)",zh:"金边粿条",ja:"プノンペン風フーティウ"},
  desc:{en:"Clear pork broth with chewy rice noodles, shrimp, minced pork, quail egg and fried garlic.",ko:"맑은 돼지 육수에 쫄깃한 쌀국수, 새우, 다진 돼지고기, 메추리알, 튀긴 마늘.",zh:"清猪骨汤配弹牙粿条、虾、肉末、鹌鹑蛋和炸蒜。",ja:"澄んだ豚骨スープにもちもちの米麺、エビ、豚ひき肉、うずらの卵、揚げにんにく。"}},
 {vi:"Gỏi cuốn (2 cuốn)",price:20000,spice:0,alg:["shellfish","pork","peanut"],pron:"goy koo-un",
  name:{en:"Fresh spring rolls (2 pcs)",ko:"월남쌈 (2개)",zh:"鲜春卷（2条）",ja:"生春巻き(2本)"},
  desc:{en:"Rice paper rolls with shrimp, pork, vermicelli and herbs, served with peanut-hoisin dip.",ko:"라이스페이퍼에 새우, 돼지고기, 쌀국수, 허브를 말아 땅콩 호이신 소스와 함께.",zh:"米纸包虾、猪肉、米线和香草，配花生海鲜酱。",ja:"ライスペーパーでエビ、豚肉、米麺、ハーブを包み、ピーナッツ味噌だれで。"}},
 {vi:"Cà phê sữa đá",price:20000,spice:0,alg:["dairy"],pron:"kah feh sue-ah dah",
  name:{en:"Iced coffee with condensed milk",ko:"연유 아이스커피",zh:"冰炼乳咖啡",ja:"練乳アイスコーヒー"},
  desc:{en:"Strong drip coffee over ice with sweetened condensed milk.",ko:"진하게 내린 커피에 연유와 얼음.",zh:"浓滴滤咖啡加炼乳和冰块。",ja:"濃いドリップコーヒーに練乳と氷。"}},
 {vi:"Trà đá",price:3000,spice:0,alg:[],pron:"chah dah",
  name:{en:"Iced tea",ko:"아이스티",zh:"冰茶",ja:"アイスティー"},
  desc:{en:"Light iced green tea. Refills are free.",ko:"연한 아이스 녹차. 리필 무료.",zh:"淡冰绿茶，免费续杯。",ja:"あっさりした冷たい緑茶。おかわり無料。"}}
];

export const EXAMPLE_MENU: MenuData = {
  name: "Cơm Tấm Cô Ba",
  area: "Nguyễn Trãi, Quận 1",
  slug: "demo",
  published: true,
  dishes: EXAMPLE_DISHES,
};
