import { defaultOpts } from "./drinks";
import { ALLERGEN_KEYS, type Allergen, type Dish, type ML, type ShopKind } from "./types";

/**
 * Built-in translations for common Saigon street food, so menus can be translated
 * without an AI call (and without an API key). Each row:
 *   [Vietnamese name, how to say it, spice 0-3, allergens, names en|ko|zh|ja, descriptions en|ko|zh|ja, other spellings]
 * Allergens follow the same keys as the AI prompt; "fish" covers fish sauce.
 */
type Row = [string, string, number, string, [string, string, string, string], [string, string, string, string], string?];

const ROWS: Row[] = [
  // Phở
  ["Phở bò tái", "fuh baw tie", 0, "beef fish", ["Rare beef phở", "소고기 쌀국수 (레어)", "生牛肉河粉", "レア牛肉のフォー"], ["Beef broth with rice noodles and thin slices of rare beef.", "소고기 육수에 쌀국수와 얇게 썬 레어 소고기.", "牛骨汤配河粉和薄切生牛肉。", "牛骨スープに米麺と薄切りのレア牛肉。"], "phở tái"],
  ["Phở bò chín", "fuh baw chin", 0, "beef fish", ["Well-done beef phở", "양지 쌀국수", "熟牛肉河粉", "煮込み牛肉のフォー"], ["Beef broth with rice noodles and slices of well-done brisket.", "소고기 육수에 쌀국수와 푹 익힌 양지.", "牛骨汤配河粉和熟牛腩片。", "牛骨スープに米麺と煮込んだ牛バラ肉。"], "phở chín"],
  ["Phở tái nạm", "fuh tie nahm", 0, "beef fish", ["Phở with rare beef and flank", "레어 소고기와 양지 쌀국수", "生牛肉牛腩河粉", "レア牛肉と牛バラのフォー"], ["Rice noodle soup with rare beef and tender flank.", "레어 소고기와 부드러운 양지를 올린 쌀국수.", "生牛肉和牛腩配河粉汤。", "レア牛肉と柔らかい牛バラ肉の米麺スープ。"], "phở bò tái nạm"],
  ["Phở bò viên", "fuh baw vee-en", 0, "beef fish", ["Beef meatball phở", "소고기 완자 쌀국수", "牛肉丸河粉", "牛肉団子のフォー"], ["Beef broth with rice noodles and bouncy beef balls.", "소고기 육수에 쌀국수와 탱글한 소고기 완자.", "牛骨汤配河粉和弹牙牛肉丸。", "牛骨スープに米麺と弾力のある牛肉団子。"], "phở viên"],
  ["Phở đặc biệt", "fuh dahk bee-et", 0, "beef fish", ["House special phở", "스페셜 쌀국수", "特别河粉", "スペシャルフォー"], ["Beef phở with rare beef, brisket, tendon and beef balls.", "레어 소고기, 양지, 힘줄, 완자를 모두 올린 쌀국수.", "生牛肉、牛腩、牛筋和牛肉丸的河粉。", "レア牛肉、牛バラ、牛すじ、牛肉団子入りのフォー。"], "phở bò đặc biệt"],
  ["Phở gà", "fuh gah", 0, "fish", ["Chicken phở", "닭고기 쌀국수", "鸡肉河粉", "鶏肉のフォー"], ["Clear chicken broth with rice noodles and shredded chicken.", "맑은 닭 육수에 쌀국수와 찢은 닭고기.", "清鸡汤配河粉和鸡丝。", "澄んだ鶏スープに米麺とほぐした鶏肉。"]],
  ["Phở xào", "fuh sao", 0, "beef soy", ["Stir-fried phở noodles", "볶음 쌀국수", "炒河粉", "フォーの炒め麺"], ["Flat rice noodles stir-fried with beef and greens.", "넓은 쌀국수를 소고기, 채소와 함께 볶은 요리.", "河粉与牛肉和青菜同炒。", "平たい米麺を牛肉と青菜で炒めたもの。"], "phở xào bò"],
  ["Phở chay", "fuh chai", 0, "soy", ["Vegetarian phở", "채식 쌀국수", "素河粉", "ベジタリアンフォー"], ["Vegetable broth with rice noodles, tofu and mushrooms.", "채소 육수에 쌀국수, 두부, 버섯.", "蔬菜汤配河粉、豆腐和蘑菇。", "野菜スープに米麺、豆腐、きのこ。"]],
  // Bún
  ["Bún bò Huế", "boon baw hway", 2, "beef pork fish", ["Spicy Huế beef noodle soup", "후에식 매운 소고기 쌀국수", "顺化牛肉米线", "フエ風辛口牛肉麺"], ["Lemongrass and chili broth with round rice noodles, beef and pork hock.", "레몬그라스와 고추 육수에 굵은 쌀국수, 소고기, 돼지 족.", "香茅辣汤配粗米线、牛肉和猪脚。", "レモングラスと唐辛子のスープに丸い米麺、牛肉、豚足。"], "bún bò"],
  ["Bún chả", "boon chah", 0, "pork fish", ["Grilled pork with rice noodles", "분짜 (숯불 돼지고기와 쌀국수)", "烤肉米线", "ブンチャー（焼き豚とつけ麺）"], ["Grilled pork patties and slices in sweet fish sauce, with rice noodles and herbs.", "새콤달콤한 느억맘 소스에 담긴 숯불 돼지고기와 쌀국수, 허브.", "烤猪肉饼和肉片泡在甜鱼露里，配米线和香草。", "甘いヌクマムだれに浸した焼き豚とつくね、米麺とハーブ添え。"], "bún chả hà nội"],
  ["Bún thịt nướng", "boon tit noo-ung", 0, "pork peanut fish", ["Grilled pork vermicelli bowl", "숯불 돼지고기 비빔 쌀국수", "烤肉米线", "焼き豚のブン"], ["Cold rice noodles with grilled pork, herbs, peanuts and fish sauce dressing.", "차가운 쌀국수에 구운 돼지고기, 허브, 땅콩, 느억맘 소스.", "凉米线配烤猪肉、香草、花生和鱼露汁。", "冷たい米麺に焼き豚、ハーブ、ピーナッツ、ヌクマムだれ。"]],
  ["Bún thịt nướng chả giò", "boon tit noo-ung chah yaw", 0, "pork peanut fish gluten shellfish", ["Grilled pork and spring roll vermicelli", "숯불 돼지고기와 짜조 비빔 쌀국수", "烤肉炸春卷米线", "焼き豚と揚げ春巻きのブン"], ["Rice noodles with grilled pork, fried spring rolls, herbs and fish sauce.", "쌀국수에 숯불 돼지고기, 튀긴 짜조, 허브, 느억맘 소스.", "米线配烤猪肉、炸春卷、香草和鱼露。", "米麺に焼き豚、揚げ春巻き、ハーブ、ヌクマム。"]],
  ["Bún riêu", "boon ree-oo", 1, "shellfish pork fish soy", ["Crab and tomato noodle soup", "게살 토마토 쌀국수", "蟹肉番茄米线", "カニとトマトの米麺スープ"], ["Tomato broth with crab paste, tofu, pork and rice noodles.", "토마토 육수에 게살 완자, 두부, 돼지고기, 쌀국수.", "番茄汤配蟹肉糕、豆腐、猪肉和米线。", "トマトスープにカニのすり身、豆腐、豚肉、米麺。"], "bún riêu cua"],
  ["Bún mắm", "boon mum", 1, "fish shellfish pork", ["Fermented fish noodle soup", "젓갈 쌀국수", "鱼露米线汤", "発酵魚のスープ麺"], ["Rich fermented-fish broth with seafood, pork, eggplant and rice noodles.", "진한 젓갈 육수에 해산물, 돼지고기, 가지, 쌀국수.", "浓郁鱼酱汤配海鲜、猪肉、茄子和米线。", "濃厚な発酵魚スープに魚介、豚肉、なす、米麺。"]],
  ["Bún mọc", "boon mawk", 0, "pork fish", ["Pork meatball noodle soup", "돼지고기 완자 쌀국수", "猪肉丸米线", "豚肉団子の米麺スープ"], ["Clear pork broth with pork balls, mushrooms and rice noodles.", "맑은 돼지 육수에 돼지고기 완자, 버섯, 쌀국수.", "清猪骨汤配猪肉丸、蘑菇和米线。", "澄んだ豚骨スープに豚肉団子、きのこ、米麺。"]],
  ["Bún đậu mắm tôm", "boon dow mum tome", 0, "soy shellfish pork", ["Tofu and rice noodles with shrimp paste", "두부와 새우젓 쌀국수", "虾酱豆腐米线", "揚げ豆腐とエビ味噌の米麺"], ["Fried tofu, boiled pork and rice noodle cakes with pungent shrimp paste dip.", "튀긴 두부, 삶은 돼지고기, 쌀국수를 진한 새우젓에 찍어 먹는 요리.", "炸豆腐、白切肉和米线块，蘸浓郁虾酱。", "揚げ豆腐、ゆで豚、固めた米麺を濃厚なエビ味噌につけて。"], "bún đậu"],
  ["Bún cá", "boon kah", 0, "fish", ["Fish noodle soup", "생선 쌀국수", "鱼米线", "魚の米麺スープ"], ["Light broth with fried fish cake, fish and rice noodles.", "담백한 육수에 어묵, 생선, 쌀국수.", "清汤配炸鱼饼、鱼肉和米线。", "あっさりスープに揚げさつま揚げ、魚、米麺。"]],
  ["Bún nem nướng", "boon nem noo-ung", 0, "pork peanut fish", ["Grilled pork sausage vermicelli", "구운 돼지고기 소시지 비빔 쌀국수", "烤肉肠米线", "焼きつくねのブン"], ["Rice noodles with grilled pork sausage, herbs and peanut sauce.", "쌀국수에 구운 돼지고기 소시지, 허브, 땅콩 소스.", "米线配烤猪肉肠、香草和花生酱。", "米麺に焼きソーセージ、ハーブ、ピーナッツソース。"]],
  ["Bún bì", "boon bee", 0, "pork fish peanut", ["Shredded pork skin vermicelli", "돼지껍데기채 비빔 쌀국수", "猪皮丝米线", "豚皮細切りのブン"], ["Rice noodles with shredded pork and pork skin, herbs and fish sauce.", "쌀국수에 돼지고기와 돼지껍데기채, 허브, 느억맘.", "米线配猪肉丝、猪皮丝、香草和鱼露。", "米麺に豚肉と豚皮の細切り、ハーブ、ヌクマム。"]],
  ["Bún chay", "boon chai", 0, "soy peanut", ["Vegetarian vermicelli", "채식 쌀국수", "素米线", "ベジタリアンのブン"], ["Rice noodles with tofu, mushrooms, vegetables and soy dressing.", "쌀국수에 두부, 버섯, 채소, 간장 소스.", "米线配豆腐、蘑菇、蔬菜和酱油汁。", "米麺に豆腐、きのこ、野菜、醤油だれ。"]],
  ["Bún bò Nam Bộ", "boon baw nahm baw", 0, "beef peanut fish", ["Southern beef vermicelli", "남부식 소고기 비빔 쌀국수", "南部牛肉拌米线", "南部風牛肉混ぜ麺"], ["Rice noodles with stir-fried beef, herbs, fried shallots and peanuts.", "쌀국수에 볶은 소고기, 허브, 튀긴 샬롯, 땅콩.", "米线配炒牛肉、香草、炸红葱和花生。", "米麺に炒め牛肉、ハーブ、揚げエシャロット、ピーナッツ。"]],
  // Hủ tiếu, mì, bánh canh
  ["Hủ tiếu Nam Vang", "hoo tee-oo nahm vahng", 0, "pork shellfish egg fish", ["Phnom Penh-style noodle soup", "프놈펜식 쌀국수 (후띠우)", "金边粿条", "プノンペン風フーティウ"], ["Clear pork broth with rice noodles, shrimp, minced pork and quail egg.", "맑은 돼지 육수에 쌀국수, 새우, 다진 돼지고기, 메추리알.", "清猪骨汤配粿条、虾、肉末和鹌鹑蛋。", "澄んだ豚骨スープに米麺、エビ、豚ひき肉、うずらの卵。"], "hủ tiếu"],
  ["Hủ tiếu khô", "hoo tee-oo kho", 0, "pork shellfish soy fish", ["Dry noodles with broth on the side", "비빔 후띠우", "干拌粿条", "汁なしフーティウ"], ["Rice noodles tossed in sweet soy sauce with pork and shrimp, soup on the side.", "달콤한 간장 소스에 비빈 쌀국수와 돼지고기, 새우, 국물 별도.", "粿条拌甜酱油配猪肉和虾，汤另上。", "甘い醤油だれで和えた米麺に豚肉とエビ、スープ別添え。"]],
  ["Hủ tiếu bò kho", "hoo tee-oo baw kho", 1, "beef fish", ["Beef stew with rice noodles", "소고기 스튜 쌀국수", "红烧牛肉粿条", "牛肉煮込みのフーティウ"], ["Lemongrass and star anise beef stew served over rice noodles.", "레몬그라스와 팔각으로 끓인 소고기 스튜를 쌀국수에.", "香茅八角炖牛肉配粿条。", "レモングラスと八角の牛肉煮込みを米麺にのせて。"]],
  ["Mì Quảng", "mee kwahng", 1, "pork shellfish peanut fish egg", ["Quảng-style turmeric noodles", "미꽝 (꽝남식 강황 국수)", "广南面", "ミークアン（広南風ターメリック麺）"], ["Wide turmeric noodles with shrimp, pork, a little rich broth, peanuts and rice cracker.", "넓은 강황 면에 새우, 돼지고기, 진한 국물 약간, 땅콩, 쌀과자.", "黄姜宽面配虾、猪肉、少量浓汤、花生和米饼。", "幅広のターメリック麺にエビ、豚肉、少しの濃厚スープ、ピーナッツ、せんべい。"]],
  ["Mì vịt tiềm", "mee vit tee-em", 0, "gluten egg soy", ["Braised duck egg noodles", "오리 한방 에그누들", "鸭腿面", "アヒルの薬膳煮込み麺"], ["Egg noodles with a duck leg braised in herbal soy broth.", "한방 간장 육수에 조린 오리다리와 에그누들.", "蛋面配药膳酱汁炖鸭腿。", "漢方醤油スープで煮込んだ鴨もも肉と卵麺。"]],
  ["Mì hoành thánh", "mee hwahn tahn", 0, "gluten egg pork shellfish", ["Wonton egg noodle soup", "완탕 에그누들 수프", "云吞面", "ワンタン麺"], ["Egg noodles in pork broth with shrimp and pork wontons.", "돼지 육수에 에그누들과 새우·돼지고기 완탕.", "猪骨汤配蛋面和虾肉云吞。", "豚骨スープに卵麺とエビ豚ワンタン。"], "mì sủi cảo"],
  ["Mì xào bò", "mee sao baw", 0, "gluten egg beef soy", ["Stir-fried noodles with beef", "소고기 볶음면", "牛肉炒面", "牛肉焼きそば"], ["Egg noodles stir-fried with beef and vegetables.", "에그누들을 소고기, 채소와 함께 볶은 요리.", "蛋面与牛肉和蔬菜同炒。", "卵麺を牛肉と野菜で炒めたもの。"]],
  ["Mì xào hải sản", "mee sao high sahn", 0, "gluten egg shellfish soy", ["Stir-fried noodles with seafood", "해산물 볶음면", "海鲜炒面", "海鮮焼きそば"], ["Egg noodles stir-fried with shrimp, squid and vegetables.", "에그누들을 새우, 오징어, 채소와 함께 볶은 요리.", "蛋面与虾、鱿鱼和蔬菜同炒。", "卵麺をエビ、イカ、野菜で炒めたもの。"]],
  ["Mì gói xào", "mee goy sao", 0, "gluten soy egg", ["Stir-fried instant noodles", "볶음 라면", "炒泡面", "インスタント焼きそば"], ["Instant noodles stir-fried with egg and greens.", "라면을 달걀, 채소와 함께 볶은 요리.", "泡面与鸡蛋和青菜同炒。", "インスタント麺を卵と青菜で炒めたもの。"], "mì xào"],
  ["Cao lầu", "kow low", 0, "gluten pork soy", ["Hội An cao lầu noodles", "까오러우 (호이안 국수)", "会安高楼面", "カオラウ（ホイアン麺）"], ["Chewy noodles with char siu pork, greens and crispy croutons.", "쫄깃한 면에 차슈, 채소, 바삭한 튀김.", "筋道面条配叉烧、青菜和脆片。", "コシのある麺にチャーシュー、青菜、カリカリの揚げ生地。"]],
  ["Bánh canh cua", "bun kahn koo-ah", 0, "shellfish pork fish", ["Thick noodle soup with crab", "게살 우동 쌀국수", "蟹肉粗面汤", "カニ入り太麺スープ"], ["Thick tapioca noodles in a rich crab broth with crab meat and shrimp.", "진한 게 육수에 굵은 타피오카 면, 게살, 새우.", "浓蟹汤配粗木薯粉面、蟹肉和虾。", "濃厚なカニスープにもちもち太麺、カニ身、エビ。"]],
  ["Bánh canh giò heo", "bun kahn yaw heh-oh", 0, "pork fish", ["Thick noodle soup with pork hock", "돼지족 우동 쌀국수", "猪脚粗面汤", "豚足入り太麺スープ"], ["Thick noodles in pork broth with tender pork hock.", "돼지 육수에 굵은 면과 부드러운 돼지 족.", "猪骨汤配粗面和软嫩猪脚。", "豚骨スープに太麺と柔らかい豚足。"]],
  ["Bánh canh chả cá", "bun kahn chah kah", 0, "fish", ["Thick noodle soup with fish cake", "어묵 우동 쌀국수", "鱼饼粗面汤", "さつま揚げ入り太麺スープ"], ["Thick noodles in light broth with fish cake.", "담백한 국물에 굵은 면과 어묵.", "清汤配粗面和鱼饼。", "あっさりスープに太麺とさつま揚げ。"]],
  ["Miến gà", "mee-en gah", 0, "fish", ["Glass noodle soup with chicken", "닭고기 당면 수프", "鸡肉粉丝汤", "鶏肉の春雨スープ"], ["Glass noodles in chicken broth with shredded chicken.", "닭 육수에 당면과 찢은 닭고기.", "鸡汤配粉丝和鸡丝。", "鶏スープに春雨とほぐした鶏肉。"]],
  ["Miến lươn", "mee-en loo-un", 1, "fish", ["Glass noodles with crispy eel", "장어 당면", "鳝鱼粉丝", "うなぎの春雨"], ["Glass noodles with crispy fried eel, in soup or dry.", "바삭하게 튀긴 장어와 당면, 국물 또는 비빔.", "粉丝配酥炸鳝鱼，可汤可干。", "カリカリに揚げたうなぎと春雨。スープか汁なしで。"]],
  // Cháo
  ["Cháo lòng", "chow long", 0, "pork fish", ["Rice porridge with pork offal", "돼지 내장 죽", "猪杂粥", "豚モツ粥"], ["Rice porridge with pork offal and blood pudding.", "돼지 내장과 선지를 넣은 쌀죽.", "猪杂和猪血配米粥。", "豚モツと血のソーセージ入りのお粥。"]],
  ["Cháo gà", "chow gah", 0, "fish", ["Chicken rice porridge", "닭죽", "鸡肉粥", "鶏粥"], ["Rice porridge with shredded chicken, ginger and herbs.", "찢은 닭고기, 생강, 허브를 넣은 쌀죽.", "鸡丝、姜和香草配米粥。", "ほぐした鶏肉、生姜、ハーブ入りのお粥。"]],
  ["Cháo vịt", "chow vit", 0, "fish", ["Duck rice porridge", "오리죽", "鸭肉粥", "鴨粥"], ["Rice porridge served with sliced duck and ginger fish sauce.", "오리고기와 생강 느억맘을 곁들인 쌀죽.", "米粥配鸭肉片和姜汁鱼露。", "鴨肉スライスと生姜ヌクマム添えのお粥。"]],
  ["Cháo trắng", "chow chahng", 0, "", ["Plain rice porridge", "흰죽", "白粥", "白粥"], ["Plain rice porridge, usually eaten with salted egg or pickles.", "소금에 절인 달걀이나 장아찌와 먹는 흰쌀죽.", "白米粥，常配咸蛋或咸菜。", "塩卵や漬物と食べる白いお粥。"]],
  ["Cháo sườn", "chow soo-un", 0, "pork", ["Pork rib porridge", "돼지갈비 죽", "排骨粥", "スペアリブ粥"], ["Smooth rice porridge with pork rib, topped with fried dough.", "부드러운 쌀죽에 돼지갈비와 꽈배기.", "绵滑米粥配排骨和油条。", "なめらかなお粥にスペアリブと揚げパン。"]],
  // Cơm
  ["Cơm tấm sườn", "gum tum soo-un", 0, "pork fish", ["Broken rice with grilled pork chop", "숯불 돼지갈비 껌땀", "烤猪排碎米饭", "焼き豚のせコムタム"], ["Broken rice with a charcoal-grilled lemongrass pork chop and sweet fish sauce.", "싸라기 쌀밥에 레몬그라스 숯불 돼지갈비와 느억맘 소스.", "碎米饭配炭烤香茅猪排和甜鱼露。", "砕き米ご飯にレモングラス風味の炭火焼き豚と甘いヌクマム。"], "cơm sườn|cơm sườn nướng|cơm tấm sườn nướng"],
  ["Cơm tấm sườn bì chả", "gum tum soo-un bee chah", 0, "pork egg fish", ["Broken rice with pork chop, pork skin and egg meatloaf", "돼지갈비, 껍데기채, 계란찜 껌땀", "猪排猪皮蛋饼碎米饭", "焼き豚・豚皮・卵蒸しのコムタム"], ["Grilled pork chop on broken rice with shredded pork skin, egg meatloaf and fish sauce.", "싸라기 쌀밥에 숯불 돼지갈비, 돼지껍데기채, 계란찜, 느억맘.", "碎米饭配烤猪排、猪皮丝、蛋肉饼和鱼露。", "砕き米ご飯に焼き豚、豚皮の細切り、卵蒸し、ヌクマム。"], "cơm sườn bì chả|cơm tấm đặc biệt"],
  ["Cơm tấm sườn trứng", "gum tum soo-un chung", 0, "pork egg fish", ["Broken rice with pork chop and fried egg", "돼지갈비 계란후라이 껌땀", "猪排煎蛋碎米饭", "焼き豚と目玉焼きのコムタム"], ["Grilled pork chop and a fried egg on broken rice.", "싸라기 쌀밥에 숯불 돼지갈비와 계란후라이.", "碎米饭配烤猪排和煎蛋。", "砕き米ご飯に焼き豚と目玉焼き。"], "cơm sườn trứng|cơm sườn ốp la"],
  ["Cơm tấm bì chả", "gum tum bee chah", 0, "pork egg fish", ["Broken rice with pork skin and egg meatloaf", "껍데기채와 계란찜 껌땀", "猪皮蛋饼碎米饭", "豚皮と卵蒸しのコムタム"], ["Broken rice with shredded pork skin and steamed egg meatloaf.", "싸라기 쌀밥에 돼지껍데기채와 계란찜.", "碎米饭配猪皮丝和蒸蛋肉饼。", "砕き米ご飯に豚皮の細切りと卵蒸し。"], "cơm bì chả"],
  ["Cơm gà", "gum gah", 0, "fish", ["Chicken rice", "닭고기 덮밥", "鸡饭", "チキンライス"], ["Chicken with rice cooked in chicken stock, with ginger sauce.", "닭 육수로 지은 밥에 닭고기와 생강 소스.", "鸡汤煮饭配鸡肉和姜汁。", "鶏ガラで炊いたご飯に鶏肉と生姜だれ。"], "cơm gà hải nam"],
  ["Cơm gà xối mỡ", "gum gah soy muh", 0, "fish soy", ["Crispy fried chicken with rice", "바삭한 닭튀김 덮밥", "脆皮炸鸡饭", "カリカリ揚げ鶏のご飯"], ["Crispy fried chicken leg with tomato rice and pickles.", "바삭한 닭다리 튀김과 토마토 밥, 장아찌.", "脆皮炸鸡腿配番茄饭和腌菜。", "カリカリの揚げ鶏ももにトマトライスと漬物。"]],
  ["Cơm chiên dương châu", "gum chee-en yoo-ung chow", 0, "egg pork shellfish soy", ["Yangzhou fried rice", "양주식 볶음밥", "扬州炒饭", "揚州チャーハン"], ["Fried rice with egg, char siu pork, shrimp and peas.", "달걀, 차슈, 새우, 완두콩을 넣은 볶음밥.", "鸡蛋、叉烧、虾仁和豌豆炒饭。", "卵、チャーシュー、エビ、グリーンピース入りのチャーハン。"], "cơm chiên|cơm rang"],
  ["Cơm chiên hải sản", "gum chee-en high sahn", 0, "egg shellfish soy", ["Seafood fried rice", "해산물 볶음밥", "海鲜炒饭", "海鮮チャーハン"], ["Fried rice with shrimp, squid and egg.", "새우, 오징어, 달걀을 넣은 볶음밥.", "虾、鱿鱼和鸡蛋炒饭。", "エビ、イカ、卵入りのチャーハン。"], "cơm rang hải sản"],
  ["Cơm chiên trứng", "gum chee-en chung", 0, "egg soy", ["Egg fried rice", "계란 볶음밥", "蛋炒饭", "卵チャーハン"], ["Rice fried with egg and spring onion.", "달걀과 파를 넣은 볶음밥.", "鸡蛋葱花炒饭。", "卵とねぎのチャーハン。"], "cơm rang trứng"],
  ["Cơm bò lúc lắc", "gum baw look luck", 0, "beef soy", ["Shaking beef with rice", "보 룩락 (소고기 큐브 볶음) 덮밥", "骰子牛肉饭", "サイコロステーキご飯"], ["Cubes of seared beef with onion and peppers, served with rice and lime-pepper dip.", "양파, 피망과 볶은 큐브 소고기에 밥과 라임 후추 소스.", "洋葱彩椒炒牛肉粒配米饭和青柠胡椒蘸料。", "玉ねぎとピーマンで炒めた角切り牛肉にご飯とライム胡椒だれ。"], "bò lúc lắc"],
  ["Cơm thịt kho trứng", "gum tit kho chung", 0, "pork egg fish", ["Caramelised pork and egg with rice", "돼지고기 달걀 조림 덮밥", "卤肉卤蛋饭", "豚肉と卵の甘辛煮ご飯"], ["Pork belly and eggs braised in coconut water and fish sauce, with rice.", "코코넛 물과 느억맘에 조린 삼겹살과 달걀에 밥.", "椰子水鱼露卤五花肉和鸡蛋配米饭。", "ココナッツ水とヌクマムで煮た豚バラと卵にご飯。"], "thịt kho trứng|thịt kho tàu"],
  ["Cơm cá kho tộ", "gum kah kho toe", 1, "fish", ["Clay-pot caramelised fish with rice", "뚝배기 생선 조림 덮밥", "砂锅焖鱼饭", "土鍋の魚の甘辛煮ご飯"], ["Catfish braised in a clay pot with caramel, pepper and fish sauce, with rice.", "뚝배기에 캐러멜, 후추, 느억맘으로 조린 메기와 밥.", "砂锅焦糖胡椒鱼露焖鲶鱼配米饭。", "土鍋でカラメル、胡椒、ヌクマムで煮たナマズにご飯。"], "cá kho tộ|cá kho"],
  ["Cơm niêu", "gum nee-oo", 0, "fish", ["Clay-pot rice", "뚝배기 밥", "砂锅饭", "土鍋ご飯"], ["Rice cooked in a small clay pot with a crispy crust, served with side dishes.", "작은 뚝배기에 지어 누룽지가 생긴 밥과 반찬.", "小砂锅煮的饭，带锅巴，配小菜。", "小さな土鍋で炊いたおこげ付きご飯とおかず。"]],
  ["Cơm chay", "gum chai", 0, "soy", ["Vegetarian rice plate", "채식 덮밥", "素食饭", "ベジタリアンご飯"], ["Rice with tofu, mushrooms and stir-fried vegetables.", "밥에 두부, 버섯, 볶은 채소.", "米饭配豆腐、蘑菇和炒蔬菜。", "ご飯に豆腐、きのこ、野菜炒め。"]],
  ["Cơm trắng", "gum chahng", 0, "", ["Steamed rice", "흰쌀밥", "白米饭", "白ご飯"], ["A bowl of plain steamed rice.", "흰쌀밥 한 공기.", "一碗白米饭。", "白ご飯一杯。"], "cơm thêm"],
  // Bánh mì
  ["Bánh mì thịt", "bun mee tit", 1, "gluten egg pork soy", ["Pork bánh mì sandwich", "돼지고기 반미", "猪肉法棍三明治", "豚肉バインミー"], ["Crispy baguette with cold cuts, pâté, mayo, pickles, cucumber, cilantro and chili.", "바삭한 바게트에 햄, 파테, 마요네즈, 절인 채소, 오이, 고수, 고추.", "酥脆法棍夹冷切肉、肝酱、蛋黄酱、腌菜、黄瓜、香菜和辣椒。", "パリパリのバゲットにハム、パテ、マヨ、なます、きゅうり、パクチー、唐辛子。"], "bánh mì thịt nguội|bánh mì đặc biệt|bánh mì"],
  ["Bánh mì ốp la", "bun mee awp lah", 0, "gluten egg soy", ["Fried egg bánh mì", "계란후라이 반미", "煎蛋法棍", "目玉焼きバインミー"], ["Baguette with fried eggs, soy sauce, cucumber and herbs.", "바게트에 계란후라이, 간장, 오이, 허브.", "法棍配煎蛋、酱油、黄瓜和香草。", "バゲットに目玉焼き、醤油、きゅうり、ハーブ。"], "bánh mì trứng"],
  ["Bánh mì xíu mại", "bun mee see-oo my", 0, "gluten pork", ["Meatball bánh mì", "미트볼 반미", "肉丸法棍", "肉団子バインミー"], ["Baguette with pork meatballs in tomato sauce.", "토마토소스에 조린 돼지고기 미트볼 반미.", "法棍配番茄汁猪肉丸。", "トマトソースの豚肉団子を挟んだバゲット。"]],
  ["Bánh mì gà", "bun mee gah", 0, "gluten egg soy", ["Chicken bánh mì", "치킨 반미", "鸡肉法棍", "チキンバインミー"], ["Baguette with shredded chicken, pickles and herbs.", "바게트에 찢은 닭고기, 절인 채소, 허브.", "法棍夹鸡丝、腌菜和香草。", "バゲットにほぐし鶏、なます、ハーブ。"]],
  ["Bánh mì chả cá", "bun mee chah kah", 1, "gluten fish", ["Fish cake bánh mì", "어묵 반미", "鱼饼法棍", "さつま揚げバインミー"], ["Baguette with fried fish cake, chili and herbs.", "바게트에 튀긴 어묵, 고추, 허브.", "法棍夹炸鱼饼、辣椒和香草。", "バゲットに揚げさつま揚げ、唐辛子、ハーブ。"]],
  ["Bánh mì heo quay", "bun mee heh-oh kway", 0, "gluten pork soy", ["Roast pork bánh mì", "바삭한 통돼지구이 반미", "烧肉法棍", "ローストポークバインミー"], ["Baguette with crispy roast pork belly and pickles.", "바게트에 바삭한 통삼겹 구이와 절인 채소.", "法棍夹脆皮烧肉和腌菜。", "バゲットにカリカリのローストポークとなます。"]],
  ["Bánh mì pate", "bun mee pah-teh", 0, "gluten pork", ["Pâté bánh mì", "파테 반미", "肝酱法棍", "パテのバインミー"], ["Baguette spread with pork liver pâté and butter.", "돼지 간 파테와 버터를 바른 바게트.", "抹猪肝酱和黄油的法棍。", "豚レバーパテとバターを塗ったバゲット。"], "bánh mì pa tê"],
  ["Bánh mì chay", "bun mee chai", 0, "gluten soy", ["Vegetarian bánh mì", "채식 반미", "素食法棍", "ベジタリアンバインミー"], ["Baguette with tofu, mock meat, pickles and herbs.", "바게트에 두부, 콩고기, 절인 채소, 허브.", "法棍夹豆腐、素肉、腌菜和香草。", "バゲットに豆腐、大豆ミート、なます、ハーブ。"]],
  ["Bánh mì chảo", "bun mee chow", 0, "gluten egg pork beef", ["Sizzling pan bánh mì", "철판 반미", "铁板法棍", "鉄板バインミー"], ["Sizzling pan of egg, pâté, sausage and meatballs with bread on the side.", "철판에 달걀, 파테, 소시지, 미트볼과 바게트.", "铁板上的鸡蛋、肝酱、香肠和肉丸，配法棍。", "鉄板で焼いた卵、パテ、ソーセージ、肉団子とバゲット。"], "bánh mì bò né"],
  ["Bánh mì bơ sữa", "bun mee buh sue-ah", 0, "gluten dairy", ["Butter and condensed milk bread", "버터 연유 빵", "黄油炼乳面包", "バターと練乳のパン"], ["Toasted baguette with butter and sweet condensed milk.", "구운 바게트에 버터와 연유.", "烤法棍抹黄油和炼乳。", "トーストしたバゲットにバターと練乳。"]],
  // Bánh & rolls
  ["Bánh xèo", "bun seh-oh", 0, "shellfish pork fish", ["Crispy Vietnamese pancake", "반쎄오 (베트남식 부침개)", "越南煎饼", "バインセオ（ベトナム風お好み焼き）"], ["Crispy turmeric rice pancake with shrimp, pork and bean sprouts, wrapped in greens.", "새우, 돼지고기, 숙주를 넣은 바삭한 강황 쌀전병을 채소에 싸서.", "黄姜米煎饼夹虾、猪肉和豆芽，用菜叶包着吃。", "エビ、豚肉、もやし入りのパリパリのターメリック米粉生地を葉野菜で包んで。"]],
  ["Bánh khọt", "bun khot", 0, "shellfish fish", ["Mini crispy shrimp pancakes", "반콧 (미니 새우 전병)", "迷你虾煎饼", "バインコット（ミニエビ焼き）"], ["Bite-size crispy rice cakes topped with shrimp, eaten with herbs and fish sauce.", "새우를 올린 한입 크기 바삭한 쌀전병을 허브와 느억맘에.", "一口大小的脆米饼配虾，搭配香草和鱼露。", "エビをのせた一口サイズのカリカリ米粉焼き、ハーブとヌクマムで。"]],
  ["Bánh cuốn", "bun koo-un", 0, "pork fish", ["Steamed rice rolls", "반꾸온 (찐 쌀전병 롤)", "越南粉卷", "バインクオン（蒸し米粉巻き）"], ["Silky steamed rice sheets filled with pork and mushroom, with fried shallots.", "돼지고기와 버섯을 넣은 부드러운 찐 쌀피에 튀긴 샬롯.", "嫩滑米皮卷猪肉和木耳，撒炸红葱。", "豚肉ときのこを包んだつるつるの蒸し米粉シート、揚げエシャロット添え。"]],
  ["Bánh bèo", "bun beh-oh", 0, "shellfish fish", ["Steamed rice cakes with shrimp", "반베오 (새우 쌀떡)", "水蕨饼", "バインベオ（エビのせ蒸し米粉餅）"], ["Little steamed rice cakes topped with dried shrimp and crispy pork skin.", "말린 새우와 바삭한 돼지껍데기를 올린 작은 찐 쌀떡.", "小碟蒸米糕配虾米和脆猪皮。", "干しエビとカリカリ豚皮をのせた小さな蒸し米粉餅。"]],
  ["Bánh bột lọc", "bun boat lawk", 0, "shellfish pork fish", ["Tapioca shrimp dumplings", "타피오카 새우 만두", "木薯虾饺", "タピオカのエビ餃子"], ["Chewy clear tapioca dumplings filled with shrimp and pork.", "새우와 돼지고기를 넣은 쫄깃하고 투명한 타피오카 만두.", "晶莹弹牙的木薯粉饺，内馅虾和猪肉。", "エビと豚肉入りのもちもち透明なタピオカ餃子。"]],
  ["Bánh căn", "bun cun", 1, "egg shellfish fish", ["Mini rice cakes with egg", "반깐 (미니 달걀 쌀빵)", "鸡蛋小米饼", "バインカン（卵入りミニ米粉焼き）"], ["Small clay-mould rice cakes with egg or seafood, dipped in fish sauce.", "달걀이나 해산물을 넣어 틀에 구운 작은 쌀빵을 느억맘에.", "陶模烤的小米饼加鸡蛋或海鲜，蘸鱼露。", "卵や魚介入りの小さな米粉焼き、ヌクマムにつけて。"]],
  ["Bánh tráng nướng", "bun chahng noo-ung", 1, "egg pork shellfish dairy", ["Grilled rice paper 'pizza'", "구운 라이스페이퍼 피자", "越南烤米纸披萨", "焼きライスペーパーピザ"], ["Rice paper grilled over charcoal with egg, spring onion, dried shrimp and sausage.", "숯불에 구운 라이스페이퍼에 달걀, 파, 말린 새우, 소시지.", "炭烤米纸加鸡蛋、葱、虾米和香肠。", "炭火で焼いたライスペーパーに卵、ねぎ、干しエビ、ソーセージ。"]],
  ["Bánh tráng trộn", "bun chahng chone", 2, "egg shellfish peanut", ["Rice paper salad", "라이스페이퍼 무침", "拌米纸", "ライスペーパーのサラダ"], ["Strips of rice paper tossed with quail egg, dried shrimp, mango, herbs and chili.", "라이스페이퍼채를 메추리알, 말린 새우, 망고, 허브, 고추와 버무린 것.", "米纸丝拌鹌鹑蛋、虾米、芒果、香草和辣椒。", "細切りライスペーパーをうずら卵、干しエビ、マンゴー、ハーブ、唐辛子で和えたもの。"]],
  ["Bánh bao", "bun bow", 0, "gluten pork egg", ["Steamed pork bun", "찐빵 (돼지고기 만두)", "包子", "肉まん"], ["Fluffy steamed bun filled with pork, egg and sausage.", "돼지고기, 달걀, 소시지를 넣은 폭신한 찐빵.", "松软包子，馅料有猪肉、鸡蛋和香肠。", "豚肉、卵、ソーセージ入りのふわふわ蒸しパン。"]],
  ["Bánh giò", "bun yaw", 0, "pork", ["Pyramid rice dumpling", "반조 (바나나잎 쌀만두)", "越南粽子糕", "バインゾー（バナナ葉包み米粉餅）"], ["Soft rice-flour dumpling with pork and mushroom, wrapped in banana leaf.", "바나나잎에 싼 돼지고기와 버섯 소의 부드러운 쌀가루 만두.", "香蕉叶包的软米粉糕，内馅猪肉和木耳。", "豚肉ときのこ入りの柔らかい米粉餅をバナナの葉で包んだもの。"]],
  ["Bánh ướt", "bun oot", 0, "pork fish", ["Steamed rice sheets with pork sausage", "찐 쌀피와 돼지고기 햄", "越南肠粉", "蒸し米粉シートとハム"], ["Plain steamed rice sheets with Vietnamese pork sausage and fish sauce.", "찐 쌀피에 베트남 햄과 느억맘.", "蒸米皮配越南扎肉和鱼露。", "蒸し米粉シートにベトナムハムとヌクマム。"]],
  ["Bột chiên", "boat chee-en", 0, "egg soy", ["Fried rice-flour cake with egg", "달걀 떡볶음", "炒粿", "揚げ米粉餅の卵炒め"], ["Cubes of rice-flour cake fried crispy with egg, served with papaya pickle.", "바삭하게 튀긴 쌀떡을 달걀과 볶아 파파야 절임과 함께.", "米粉糕块与鸡蛋炒至香脆，配腌木瓜。", "米粉餅を卵とカリッと焼き、パパイヤの漬物添え。"]],
  ["Xôi gà", "soy gah", 0, "fish", ["Sticky rice with chicken", "닭고기 찹쌀밥", "鸡肉糯米饭", "鶏肉おこわ"], ["Sticky rice topped with shredded chicken and fried shallots.", "찹쌀밥에 찢은 닭고기와 튀긴 샬롯.", "糯米饭配鸡丝和炸红葱。", "もち米に裂いた鶏肉と揚げエシャロット。"]],
  ["Xôi mặn", "soy mun", 0, "pork egg fish", ["Savoury sticky rice", "짭짤한 찹쌀밥", "咸糯米饭", "おかずおこわ"], ["Sticky rice topped with sausage, pork floss, egg and fried shallots.", "찹쌀밥에 소시지, 돼지고기 플로스, 달걀, 튀긴 샬롯.", "糯米饭配腊肠、肉松、鸡蛋和炸红葱。", "もち米にソーセージ、肉でんぶ、卵、揚げエシャロット。"]],
  ["Xôi xéo", "soy seh-oh", 0, "", ["Sticky rice with mung bean", "녹두 찹쌀밥", "绿豆糯米饭", "緑豆おこわ"], ["Yellow sticky rice with mung bean paste and fried shallots.", "노란 찹쌀밥에 녹두 앙금과 튀긴 샬롯.", "黄糯米饭配绿豆泥和炸红葱。", "黄色いもち米に緑豆ペーストと揚げエシャロット。"]],
  ["Xôi đậu phộng", "soy dow fong", 0, "peanut", ["Sticky rice with peanuts", "땅콩 찹쌀밥", "花生糯米饭", "ピーナッツおこわ"], ["Sticky rice cooked with peanuts, served with sesame salt.", "땅콩을 넣어 지은 찹쌀밥에 깨소금.", "花生糯米饭，配芝麻盐。", "ピーナッツ入りのもち米、ごま塩添え。"], "xôi lạc"],
  ["Gỏi cuốn", "goy koo-un", 0, "shellfish pork peanut", ["Fresh spring rolls", "월남쌈", "鲜春卷", "生春巻き"], ["Rice paper rolls with shrimp, pork, noodles and herbs, with peanut-hoisin dip.", "라이스페이퍼에 새우, 돼지고기, 쌀국수, 허브를 말아 땅콩 호이신 소스와 함께.", "米纸包虾、猪肉、米线和香草，配花生海鲜酱。", "ライスペーパーでエビ、豚肉、米麺、ハーブを包み、ピーナッツ味噌だれで。"]],
  ["Chả giò", "chah yaw", 0, "pork shellfish egg fish", ["Fried spring rolls", "짜조 (튀긴 스프링롤)", "炸春卷", "揚げ春巻き"], ["Crispy fried rolls filled with pork, shrimp and vegetables, with fish sauce dip.", "돼지고기, 새우, 채소를 넣어 바삭하게 튀긴 롤과 느억맘 소스.", "猪肉、虾和蔬菜馅的酥炸春卷，配鱼露。", "豚肉、エビ、野菜入りのカリカリ揚げ春巻き、ヌクマム添え。"], "nem rán|chả ram"],
  ["Nem nướng", "nem noo-ung", 0, "pork peanut", ["Grilled pork sausage rolls", "구운 돼지고기 소시지 롤", "烤肉肠卷", "焼きつくねの生春巻き"], ["Grilled pork sausage wrapped in rice paper with herbs, with peanut sauce.", "구운 돼지고기 소시지를 허브와 라이스페이퍼에 싸서 땅콩 소스와.", "烤猪肉肠配香草卷米纸，蘸花生酱。", "焼きソーセージをハーブとライスペーパーで包み、ピーナッツソースで。"]],
  ["Bò bía", "baw bee-ah", 0, "pork egg shellfish peanut soy", ["Jicama and sausage rolls", "보비아 (히카마 롤)", "薄饼卷", "ボービア（クズイモ巻き）"], ["Fresh rolls with jicama, Chinese sausage, egg and dried shrimp, with peanut sauce.", "히카마, 중국식 소시지, 달걀, 말린 새우를 넣은 롤과 땅콩 소스.", "豆薯、腊肠、鸡蛋和虾米鲜卷，配花生酱。", "クズイモ、腸詰め、卵、干しエビの生春巻き、ピーナッツソース添え。"]],
  ["Gỏi đu đủ", "goy doo doo", 2, "beef fish peanut", ["Green papaya salad", "그린 파파야 샐러드", "青木瓜沙拉", "青パパイヤのサラダ"], ["Shredded green papaya with dried beef jerky, herbs, peanuts and chili.", "채 썬 그린 파파야에 소고기 육포, 허브, 땅콩, 고추.", "青木瓜丝配牛肉干、香草、花生和辣椒。", "細切り青パパイヤに牛肉ジャーキー、ハーブ、ピーナッツ、唐辛子。"], "gỏi đu đủ khô bò"],
  ["Gỏi gà", "goy gah", 1, "fish peanut", ["Chicken and cabbage salad", "닭고기 양배추 샐러드", "鸡肉卷心菜沙拉", "鶏肉とキャベツのサラダ"], ["Shredded chicken and cabbage with herbs, onion and lime fish sauce.", "찢은 닭고기와 양배추에 허브, 양파, 라임 느억맘.", "鸡丝和卷心菜配香草、洋葱和青柠鱼露。", "ほぐし鶏とキャベツにハーブ、玉ねぎ、ライムヌクマム。"]],
  ["Gỏi ngó sen", "goy naw sen", 1, "shellfish pork fish peanut", ["Lotus stem salad", "연근줄기 샐러드", "莲藕梗沙拉", "蓮の茎のサラダ"], ["Crunchy lotus stems with shrimp, pork, herbs and peanuts.", "아삭한 연근줄기에 새우, 돼지고기, 허브, 땅콩.", "脆嫩莲梗配虾、猪肉、香草和花生。", "シャキシャキの蓮の茎にエビ、豚肉、ハーブ、ピーナッツ。"]],
  // Grills & mains
  ["Bò lá lốt", "baw lah loht", 0, "beef peanut fish", ["Beef wrapped in betel leaves", "라롯잎 소고기 말이 구이", "假蒌叶烤牛肉卷", "ロットの葉の牛肉巻き焼き"], ["Minced beef wrapped in betel leaves and grilled, with peanuts and fish sauce.", "다진 소고기를 라롯잎에 싸서 구워 땅콩과 느억맘을 곁들인 요리.", "假蒌叶包牛肉碎烤制，配花生和鱼露。", "牛ひき肉をロットの葉で巻いて焼き、ピーナッツとヌクマムで。"]],
  ["Bò né", "baw neh", 0, "beef egg gluten soy", ["Sizzling steak and eggs", "철판 스테이크와 달걀", "铁板牛排煎蛋", "鉄板ステーキと目玉焼き"], ["Steak and fried eggs on a sizzling pan, with pâté and bread.", "지글지글한 철판에 스테이크와 계란후라이, 파테와 빵.", "铁板上的牛排和煎蛋，配肝酱和面包。", "熱々の鉄板にステーキと目玉焼き、パテとパン添え。"]],
  ["Bò kho", "baw kho", 1, "beef fish gluten", ["Vietnamese beef stew", "베트남식 소고기 스튜", "越南红烧牛肉", "ベトナム風牛肉シチュー"], ["Beef stewed with lemongrass, star anise and carrots, served with bread.", "레몬그라스, 팔각, 당근을 넣고 끓인 소고기 스튜와 빵.", "香茅、八角和胡萝卜炖牛肉，配面包。", "レモングラス、八角、にんじんで煮込んだ牛肉、パン添え。"], "bánh mì bò kho"],
  ["Thịt nướng", "tit noo-ung", 0, "pork fish", ["Grilled lemongrass pork", "레몬그라스 돼지고기 구이", "香茅烤猪肉", "レモングラス焼き豚"], ["Pork marinated in lemongrass and grilled over charcoal.", "레몬그라스에 재워 숯불에 구운 돼지고기.", "香茅腌制的炭烤猪肉。", "レモングラスに漬けて炭火で焼いた豚肉。"]],
  ["Gà nướng", "gah noo-ung", 1, "fish soy", ["Grilled chicken", "닭구이", "烤鸡", "焼き鳥（丸鶏）"], ["Chicken marinated with honey and lemongrass, grilled over charcoal.", "꿀과 레몬그라스에 재워 숯불에 구운 닭고기.", "蜂蜜香茅腌制的炭烤鸡。", "はちみつとレモングラスに漬けて炭火で焼いた鶏肉。"]],
  ["Chân gà nướng", "chun gah noo-ung", 2, "fish soy", ["Grilled chicken feet", "닭발 구이", "烤鸡爪", "鶏足の炭火焼き"], ["Chicken feet glazed with honey and chili, grilled until sticky.", "꿀과 고추 양념을 발라 구운 닭발.", "蜂蜜辣椒酱烤鸡爪。", "はちみつと唐辛子のたれで焼いた鶏足。"]],
  ["Cánh gà chiên nước mắm", "kahn gah chee-en noo-uk mum", 0, "fish", ["Fish sauce chicken wings", "느억맘 닭날개 튀김", "鱼露炸鸡翅", "ヌクマム手羽先揚げ"], ["Fried chicken wings tossed in caramelised fish sauce and garlic.", "튀긴 닭날개에 캐러멜 느억맘과 마늘 소스.", "炸鸡翅裹焦糖鱼露和蒜。", "揚げた手羽先をカラメルヌクマムとにんにくで絡めたもの。"], "cánh gà chiên"],
  ["Heo quay", "heh-oh kway", 0, "pork soy", ["Crispy roast pork", "바삭한 통돼지구이", "脆皮烧肉", "皮付きローストポーク"], ["Roast pork belly with crackling skin.", "껍질이 바삭한 통삼겹 구이.", "皮脆的烤五花肉。", "皮がパリパリのローストポーク。"]],
  ["Vịt quay", "vit kway", 0, "soy", ["Roast duck", "오리구이", "烤鸭", "ローストダック"], ["Glossy roast duck with a sweet soy dip.", "윤기 나는 오리구이와 달콤한 간장 소스.", "油亮烤鸭配甜酱油。", "照りのあるローストダック、甘い醤油だれ添え。"]],
  ["Sườn nướng", "soo-un noo-ung", 0, "pork fish", ["Grilled pork ribs", "돼지갈비 구이", "烤排骨", "スペアリブ焼き"], ["Pork ribs marinated in lemongrass and honey, grilled over charcoal.", "레몬그라스와 꿀에 재워 숯불에 구운 돼지갈비.", "香茅蜂蜜腌制的炭烤排骨。", "レモングラスとはちみつに漬けて炭火で焼いたスペアリブ。"]],
  ["Canh chua cá", "kahn choo-ah kah", 1, "fish", ["Sweet and sour fish soup", "새콤달콤 생선 수프", "酸鱼汤", "魚の甘酸っぱいスープ"], ["Tamarind soup with fish, pineapple, tomato and okra.", "타마린드 국물에 생선, 파인애플, 토마토, 오크라.", "罗望子汤配鱼、菠萝、番茄和秋葵。", "タマリンドのスープに魚、パイナップル、トマト、オクラ。"], "canh chua"],
  ["Rau muống xào tỏi", "zow moo-ung sao toy", 0, "fish", ["Morning glory with garlic", "마늘 공심채 볶음", "蒜炒空心菜", "空芯菜のにんにく炒め"], ["Water spinach stir-fried with lots of garlic.", "마늘을 듬뿍 넣고 볶은 공심채.", "大蒜爆炒空心菜。", "たっぷりのにんにくで炒めた空芯菜。"], "rau muống xào"],
  ["Đậu hũ chiên", "dow hoo chee-en", 0, "soy", ["Fried tofu", "두부 튀김", "炸豆腐", "揚げ豆腐"], ["Golden fried tofu with soy or chili dip.", "노릇하게 튀긴 두부와 간장 또는 칠리 소스.", "金黄炸豆腐配酱油或辣酱。", "こんがり揚げた豆腐、醤油かチリだれで。"], "đậu phụ chiên|đậu hũ chiên giòn"],
  ["Đậu hũ sốt cà chua", "dow hoo soht kah choo-ah", 0, "soy fish", ["Tofu in tomato sauce", "토마토소스 두부", "番茄豆腐", "豆腐のトマト煮"], ["Fried tofu simmered in tomato sauce with spring onion.", "튀긴 두부를 파와 함께 토마토소스에 조린 요리.", "炸豆腐配葱花番茄汁烩制。", "揚げ豆腐をねぎとトマトソースで煮込んだもの。"], "đậu phụ sốt cà chua"],
  ["Trứng chiên", "chung chee-en", 0, "egg fish", ["Vietnamese omelette", "베트남식 오믈렛", "越南煎蛋饼", "ベトナム風オムレツ"], ["Omelette with spring onion and a little fish sauce.", "파와 느억맘을 약간 넣은 오믈렛.", "加葱花和少许鱼露的煎蛋饼。", "ねぎと少しのヌクマム入りのオムレツ。"], "trứng ốp la"],
  ["Hột vịt lộn", "hote vit lone", 0, "egg", ["Balut (fertilised duck egg)", "곤계란 (부화 직전 오리알)", "鸭仔蛋", "ホビロン（孵化途中のアヒルの卵）"], ["Boiled fertilised duck egg with salt, pepper, lime and Vietnamese mint.", "소금, 후추, 라임, 베트남 민트와 먹는 삶은 곤계란.", "煮熟的鸭仔蛋，配盐、胡椒、青柠和越南薄荷。", "塩、胡椒、ライム、ラウラムと食べるゆでたアヒルの有精卵。"], "trứng vịt lộn"],
  ["Hột vịt lộn xào me", "hote vit lone sao meh", 1, "egg fish peanut", ["Balut in tamarind sauce", "타마린드 소스 곤계란", "罗望子炒鸭仔蛋", "ホビロンのタマリンド炒め"], ["Balut stir-fried in sweet and sour tamarind sauce with peanuts.", "새콤달콤한 타마린드 소스에 볶은 곤계란과 땅콩.", "鸭仔蛋配酸甜罗望子酱和花生炒制。", "ホビロンを甘酸っぱいタマリンドソースとピーナッツで炒めたもの。"]],
  // Seafood & snails
  ["Ốc len xào dừa", "awk len sao yoo-ah", 1, "shellfish dairy", ["Sea snails in coconut milk", "코코넛 밀크 바다고둥 볶음", "椰汁炒螺", "巻貝のココナッツミルク炒め"], ["Mud creeper snails stir-fried in creamy coconut milk with lemongrass.", "고둥을 레몬그라스와 크리미한 코코넛 밀크에 볶은 요리.", "泥螺配香茅和浓椰汁炒制。", "巻貝をレモングラスと濃厚なココナッツミルクで炒めたもの。"]],
  ["Sò điệp nướng mỡ hành", "saw dee-ep noo-ung muh hahn", 0, "shellfish peanut", ["Grilled scallops with spring onion oil", "파기름 가리비 구이", "葱油烤扇贝", "ホタテのねぎ油焼き"], ["Scallops grilled on the shell with spring onion oil and crushed peanuts.", "껍데기째 파기름과 땅콩가루를 올려 구운 가리비.", "带壳扇贝淋葱油撒花生碎烤制。", "殻付きホタテにねぎ油と砕いたピーナッツをのせて焼いたもの。"], "sò điệp nướng"],
  ["Nghêu hấp sả", "ngee-oo hup sah", 1, "shellfish", ["Clams steamed with lemongrass", "레몬그라스 바지락 찜", "香茅蒸蛤蜊", "あさりのレモングラス蒸し"], ["Clams steamed with lemongrass, ginger and chili.", "레몬그라스, 생강, 고추와 함께 찐 바지락.", "蛤蜊配香茅、姜和辣椒清蒸。", "あさりをレモングラス、生姜、唐辛子で蒸したもの。"]],
  ["Tôm nướng", "tome noo-ung", 0, "shellfish", ["Grilled prawns", "새우 구이", "烤虾", "エビの炭火焼き"], ["Prawns grilled over charcoal with salt, chili and lime dip.", "숯불에 구운 새우와 소금 고추 라임 소스.", "炭烤大虾配盐、辣椒和青柠蘸料。", "炭火で焼いたエビ、塩唐辛子ライムだれ添え。"]],
  ["Mực nướng", "muk noo-ung", 1, "shellfish", ["Grilled squid", "오징어 구이", "烤鱿鱼", "イカ焼き"], ["Squid grilled over charcoal with chili salt.", "숯불에 구운 오징어와 고추 소금.", "炭烤鱿鱼配辣椒盐。", "炭火で焼いたイカ、唐辛子塩添え。"]],
  ["Cua rang me", "koo-ah zahng meh", 1, "shellfish fish", ["Tamarind crab", "타마린드 게 볶음", "罗望子炒蟹", "カニのタマリンド炒め"], ["Crab stir-fried in sweet and sour tamarind sauce.", "새콤달콤한 타마린드 소스에 볶은 게.", "螃蟹配酸甜罗望子酱炒制。", "カニを甘酸っぱいタマリンドソースで炒めたもの。"]],
  ["Lẩu thái", "low tie", 2, "shellfish fish", ["Thai-style hot pot", "태국식 샤브샤브", "泰式火锅", "タイ風鍋"], ["Spicy sour hot pot with seafood, mushrooms, vegetables and noodles.", "해산물, 버섯, 채소, 면을 넣은 맵고 새콤한 샤브샤브.", "酸辣火锅，配海鲜、蘑菇、蔬菜和面条。", "魚介、きのこ、野菜、麺入りの辛酸っぱい鍋。"], "lẩu thái hải sản"],
  ["Lẩu mắm", "low mum", 1, "fish shellfish pork", ["Fermented fish hot pot", "젓갈 샤브샤브", "鱼酱火锅", "発酵魚の鍋"], ["Mekong-style hot pot of fermented-fish broth with seafood, pork and many greens.", "젓갈 육수에 해산물, 돼지고기, 다양한 채소를 넣은 메콩식 샤브샤브.", "湄公河式鱼酱火锅，配海鲜、猪肉和多种青菜。", "発酵魚スープに魚介、豚肉、たっぷりの野菜のメコン風鍋。"]],
  ["Lẩu bò", "low baw", 0, "beef fish", ["Beef hot pot", "소고기 샤브샤브", "牛肉火锅", "牛肉鍋"], ["Hot pot with beef slices, beef balls, vegetables and noodles.", "얇은 소고기, 소고기 완자, 채소, 면을 넣은 샤브샤브.", "牛肉片、牛肉丸、蔬菜和面条火锅。", "牛肉スライス、牛肉団子、野菜、麺の鍋。"]],
  ["Lẩu dê", "low yeh", 1, "fish soy", ["Goat hot pot", "염소고기 샤브샤브", "羊肉火锅", "ヤギ鍋"], ["Herbal hot pot with goat meat, tofu skin and greens.", "한방 육수에 염소고기, 유바, 채소.", "药膳火锅配山羊肉、腐竹和青菜。", "漢方スープにヤギ肉、湯葉、青菜の鍋。"]],
  // Desserts
  ["Chè ba màu", "cheh bah mow", 0, "dairy", ["Three-colour dessert", "쩨 바마우 (삼색 디저트)", "三色甜汤", "三色チェー"], ["Layers of red beans, mung bean, green jelly and coconut milk over ice.", "팥, 녹두, 초록 젤리, 코코넛 밀크를 얼음 위에 층층이.", "红豆、绿豆、绿色果冻和椰奶加冰。", "小豆、緑豆、緑のゼリー、ココナッツミルクを氷の上に重ねたもの。"]],
  ["Chè thái", "cheh tie", 0, "dairy", ["Thai-style fruit dessert", "태국식 과일 디저트", "泰式水果甜品", "タイ風フルーツチェー"], ["Mixed tropical fruit and jelly in sweet coconut milk with ice.", "열대 과일과 젤리를 달콤한 코코넛 밀크와 얼음에.", "热带水果和果冻配甜椰奶加冰。", "南国フルーツとゼリーを甘いココナッツミルクと氷で。"]],
  ["Chè đậu xanh", "cheh dow sahn", 0, "dairy", ["Sweet mung bean soup", "녹두 디저트", "绿豆甜汤", "緑豆のチェー"], ["Sweet mung bean pudding with coconut milk.", "코코넛 밀크를 올린 달콤한 녹두죽.", "绿豆甜汤配椰奶。", "ココナッツミルクをかけた甘い緑豆のお汁粉。"]],
  ["Chè chuối", "cheh choo-oy", 0, "dairy peanut", ["Banana in coconut milk", "코코넛 밀크 바나나 디저트", "椰奶香蕉甜汤", "バナナのココナッツミルク煮"], ["Warm banana and tapioca pearls in coconut milk with peanuts.", "따뜻한 바나나와 타피오카 펄을 코코넛 밀크에, 땅콩을 올려.", "温热香蕉和西米配椰奶和花生。", "温かいバナナとタピオカをココナッツミルクで、ピーナッツ添え。"]],
  ["Chè bưởi", "cheh boo-oy", 0, "dairy", ["Pomelo peel and mung bean dessert", "자몽 껍질 녹두 디저트", "柚子皮绿豆甜汤", "ザボンの皮と緑豆のチェー"], ["Chewy pomelo pith and mung beans in sweet coconut milk.", "쫄깃한 자몽 껍질과 녹두를 달콤한 코코넛 밀크에.", "嚼劲柚子皮和绿豆配甜椰奶。", "もちもちのザボンの皮と緑豆を甘いココナッツミルクで。"]],
  ["Sương sa hạt lựu", "soo-ung sah hut loo", 0, "dairy", ["Water chestnut rubies dessert", "석류알 젤리 디저트", "红宝石马蹄甜品", "ルビー色のくわいデザート"], ["Red tapioca-coated water chestnut, jelly and coconut milk over ice.", "빨간 타피오카를 입힌 물밤, 젤리, 코코넛 밀크를 얼음 위에.", "裹红色木薯粉的马蹄、果冻和椰奶加冰。", "赤いタピオカをまとったくわい、ゼリー、ココナッツミルクを氷の上に。"]],
  ["Bánh flan", "bun flahn", 0, "egg dairy", ["Caramel custard", "캐러멜 푸딩", "焦糖布丁", "カスタードプリン"], ["Caramel egg custard, often served with ice and coffee.", "얼음과 커피를 곁들이기도 하는 캐러멜 달걀 푸딩.", "焦糖鸡蛋布丁，常配冰块和咖啡。", "カラメルプリン。氷とコーヒーをかけることも。"], "kem flan|caramen"],
  ["Kem dừa", "kem yoo-ah", 0, "dairy peanut", ["Coconut ice cream", "코코넛 아이스크림", "椰子冰淇淋", "ココナッツアイス"], ["Ice cream served in a coconut shell with coconut flesh and peanuts.", "코코넛 껍질에 담은 아이스크림과 코코넛 과육, 땅콩.", "椰壳盛的冰淇淋配椰肉和花生。", "ココナッツの殻に盛ったアイスと果肉、ピーナッツ。"]],
  ["Tàu hũ nước đường", "tow hoo noo-uk doo-ung", 0, "soy", ["Silken tofu in ginger syrup", "생강 시럽 연두부", "姜汁豆花", "豆花の生姜シロップがけ"], ["Warm silken tofu in sweet ginger syrup.", "달콤한 생강 시럽을 끼얹은 따뜻한 연두부.", "温热豆花淋甜姜汁。", "温かい豆花に甘い生姜シロップ。"], "tàu hũ|tào phớ"],
  // Drinks
  ["Cà phê sữa đá", "kah feh sue-ah dah", 0, "dairy", ["Iced coffee with condensed milk", "연유 아이스커피", "冰炼乳咖啡", "練乳アイスコーヒー"], ["Strong drip coffee over ice with sweetened condensed milk.", "진하게 내린 커피에 연유와 얼음.", "浓滴滤咖啡加炼乳和冰块。", "濃いドリップコーヒーに練乳と氷。"], "cà phê sữa|cafe sữa đá|cafe sữa"],
  ["Cà phê đen đá", "kah feh den dah", 0, "", ["Iced black coffee", "아이스 블랙커피", "冰黑咖啡", "アイスブラックコーヒー"], ["Strong Vietnamese drip coffee over ice, lightly sweetened.", "얼음 위에 진한 베트남식 드립커피, 살짝 달게.", "浓郁越南滴滤咖啡加冰，微甜。", "濃いベトナムドリップコーヒーに氷、ほんのり甘め。"], "cà phê đen|cà phê đá|cafe đen đá|cafe đen"],
  ["Cà phê sữa nóng", "kah feh sue-ah nong", 0, "dairy", ["Hot coffee with condensed milk", "따뜻한 연유 커피", "热炼乳咖啡", "ホット練乳コーヒー"], ["Hot drip coffee with sweetened condensed milk.", "따뜻한 드립커피에 연유.", "热滴滤咖啡加炼乳。", "ホットのドリップコーヒーに練乳。"]],
  ["Bạc xỉu", "bahk sew", 0, "dairy", ["Milky iced coffee", "박씨우 (우유 많은 커피)", "白咖啡", "バクシウ（ミルク多めのコーヒー）"], ["Mostly milk and condensed milk with a splash of coffee, over ice.", "우유와 연유에 커피를 조금 넣은 아이스 음료.", "以牛奶和炼乳为主，加少许咖啡和冰。", "ミルクと練乳たっぷりに少しのコーヒー、氷入り。"], "bạc sỉu"],
  ["Cà phê muối", "kah feh moo-oy", 0, "dairy", ["Salted cream coffee", "소금 크림 커피", "咸奶盖咖啡", "塩クリームコーヒー"], ["Iced coffee topped with lightly salted cream.", "살짝 짭짤한 크림을 올린 아이스커피.", "冰咖啡上覆微咸奶盖。", "ほんのり塩味のクリームをのせたアイスコーヒー。"]],
  ["Cà phê trứng", "kah feh chung", 0, "egg dairy", ["Egg coffee", "에그 커피", "鸡蛋咖啡", "エッグコーヒー"], ["Coffee topped with a thick, sweet whipped egg-yolk cream.", "달콤하게 휘핑한 노른자 크림을 올린 커피.", "咖啡上覆浓稠香甜的打发蛋黄奶油。", "甘く泡立てた卵黄クリームをのせたコーヒー。"]],
  ["Cà phê cốt dừa", "kah feh coat yoo-ah", 0, "dairy", ["Coconut coffee", "코코넛 커피", "椰子咖啡", "ココナッツコーヒー"], ["Coffee blended with icy coconut cream.", "얼음 코코넛 크림과 블렌딩한 커피.", "咖啡配冰沙椰奶。", "フローズンココナッツクリームとコーヒー。"], "cà phê dừa"],
  ["Trà đá", "chah dah", 0, "", ["Iced tea", "아이스티", "冰茶", "アイスティー"], ["Light iced green tea.", "연한 아이스 녹차.", "淡冰绿茶。", "あっさりした冷たい緑茶。"]],
  ["Trà tắc", "chah tuck", 0, "", ["Kumquat iced tea", "금귤 아이스티", "金桔冰茶", "キンカンアイスティー"], ["Iced tea with fresh kumquat juice and sugar.", "생 금귤즙과 설탕을 넣은 아이스티.", "冰茶加鲜榨金桔汁和糖。", "生のキンカン果汁と砂糖入りのアイスティー。"], "trà quất"],
  ["Trà chanh", "chah chahn", 0, "", ["Lime iced tea", "라임 아이스티", "柠檬冰茶", "ライムアイスティー"], ["Iced tea with fresh lime and sugar.", "생 라임과 설탕을 넣은 아이스티.", "冰茶加鲜青柠和糖。", "生ライムと砂糖入りのアイスティー。"]],
  ["Trà đào", "chah dow", 0, "", ["Peach iced tea", "복숭아 아이스티", "桃子冰茶", "ピーチアイスティー"], ["Iced tea with peach syrup and peach slices.", "복숭아 시럽과 복숭아 조각을 넣은 아이스티.", "冰茶加桃子糖浆和桃片。", "桃シロップと桃のスライス入りのアイスティー。"], "trà đào cam sả"],
  ["Trà sữa", "chah sue-ah", 0, "dairy", ["Milk tea", "밀크티", "奶茶", "ミルクティー"], ["Sweet milk tea, often with tapioca pearls.", "타피오카 펄을 넣기도 하는 달콤한 밀크티.", "香甜奶茶，常加珍珠。", "甘いミルクティー。タピオカ入りのことも。"]],
  ["Nước mía", "noo-uk mee-ah", 0, "", ["Fresh sugarcane juice", "사탕수수 주스", "甘蔗汁", "サトウキビジュース"], ["Freshly pressed sugarcane juice with a squeeze of kumquat, over ice.", "갓 짠 사탕수수즙에 금귤을 살짝, 얼음과 함께.", "现榨甘蔗汁加少许金桔和冰。", "搾りたてのサトウキビ果汁にキンカンを少し、氷入り。"]],
  ["Nước dừa", "noo-uk yoo-ah", 0, "", ["Fresh coconut water", "생 코코넛 워터", "鲜椰子水", "生ココナッツジュース"], ["A whole young coconut to drink from.", "어린 코코넛을 통째로 마시는 음료.", "整个嫩椰子直接饮用。", "若いココナッツを丸ごと一つ。"], "dừa tươi|dừa"],
  ["Nước cam", "noo-uk kahm", 0, "", ["Fresh orange juice", "생 오렌지 주스", "鲜橙汁", "生オレンジジュース"], ["Freshly squeezed orange juice.", "갓 짠 오렌지 주스.", "现榨橙汁。", "搾りたてのオレンジジュース。"], "nước cam vắt|cam vắt"],
  ["Nước chanh", "noo-uk chahn", 0, "", ["Fresh limeade", "라임에이드", "青柠水", "ライムジュース"], ["Fresh lime juice with sugar and ice.", "생 라임즙에 설탕과 얼음.", "鲜青柠汁加糖和冰。", "生ライム果汁に砂糖と氷。"], "chanh đá"],
  ["Nước chanh dây", "noo-uk chahn yay", 0, "", ["Passion fruit juice", "패션프루트 주스", "百香果汁", "パッションフルーツジュース"], ["Passion fruit juice with sugar and ice.", "패션프루트즙에 설탕과 얼음.", "百香果汁加糖和冰。", "パッションフルーツ果汁に砂糖と氷。"], "chanh dây"],
  ["Rau má", "zow mah", 0, "", ["Pennywort juice", "병풀 주스", "积雪草汁", "ツボクサジュース"], ["Blended pennywort leaf drink, fresh and grassy.", "병풀잎을 갈아 만든 상큼한 음료.", "积雪草叶榨的清爽饮品。", "ツボクサの葉をミキサーにかけた爽やかな飲み物。"], "nước rau má|rau má đậu xanh"],
  ["Sữa đậu nành", "sue-ah dow nahn", 0, "soy", ["Soy milk", "두유", "豆浆", "豆乳"], ["Fresh soy milk, sweetened, hot or iced.", "달게 만든 생 두유, 따뜻하게 또는 차게.", "现磨甜豆浆，冷热皆可。", "作りたての甘い豆乳。ホットかアイスで。"]],
  ["Sinh tố bơ", "sin toe buh", 0, "dairy", ["Avocado smoothie", "아보카도 스무디", "牛油果奶昔", "アボカドスムージー"], ["Avocado blended with condensed milk and ice.", "아보카도를 연유, 얼음과 함께 간 음료.", "牛油果加炼乳和冰打成。", "アボカドを練乳と氷でブレンド。"]],
  ["Sinh tố xoài", "sin toe swy", 0, "dairy", ["Mango smoothie", "망고 스무디", "芒果奶昔", "マンゴースムージー"], ["Ripe mango blended with condensed milk and ice.", "잘 익은 망고를 연유, 얼음과 함께 간 음료.", "熟芒果加炼乳和冰打成。", "完熟マンゴーを練乳と氷でブレンド。"]],
  ["Sinh tố dâu", "sin toe yow", 0, "dairy", ["Strawberry smoothie", "딸기 스무디", "草莓奶昔", "いちごスムージー"], ["Strawberries blended with condensed milk and ice.", "딸기를 연유, 얼음과 함께 간 음료.", "草莓加炼乳和冰打成。", "いちごを練乳と氷でブレンド。"]],
  ["Sinh tố mãng cầu", "sin toe mahng koh", 0, "dairy", ["Soursop smoothie", "사워솝 스무디", "红毛榴莲奶昔", "サワーソップスムージー"], ["Soursop blended with condensed milk and ice.", "사워솝을 연유, 얼음과 함께 간 음료.", "红毛榴莲加炼乳和冰打成。", "サワーソップを練乳と氷でブレンド。"]],
  ["Sữa chua đá", "sue-ah choo-ah dah", 0, "dairy", ["Iced yoghurt", "얼음 요거트", "冰酸奶", "アイスヨーグルト"], ["Vietnamese yoghurt over crushed ice.", "잘게 부순 얼음 위에 베트남식 요거트.", "越南酸奶配碎冰。", "クラッシュアイスにベトナムヨーグルト。"], "sữa chua"],
  ["Sâm bổ lượng", "sum baw loo-ung", 0, "", ["Herbal iced dessert drink", "삼보르엉 (한방 빙수 음료)", "清补凉", "サムボールオン（漢方かき氷ドリンク）"], ["Cooling drink of longan, lotus seeds, seaweed and jujube over ice.", "용안, 연밥, 해초, 대추를 얼음과 함께 담은 시원한 음료.", "龙眼、莲子、海带和红枣加冰的清凉饮品。", "竜眼、蓮の実、海藻、ナツメを氷と合わせた冷たい飲み物。"]],
  // More café and milk-tea drinks
  ["Trà sữa trân châu", "chah sue-ah chun chow", 0, "dairy", ["Bubble milk tea", "버블 밀크티", "珍珠奶茶", "タピオカミルクティー"], ["Sweet milk tea with chewy tapioca pearls.", "쫄깃한 타피오카 펄이 들어간 달콤한 밀크티.", "加Q弹珍珠的香甜奶茶。", "もちもちタピオカ入りの甘いミルクティー。"], "trà sữa trân châu đen"],
  ["Trà sữa trân châu đường đen", "chah sue-ah chun chow doo-ung den", 0, "dairy", ["Brown sugar bubble milk tea", "흑당 버블 밀크티", "黑糖珍珠奶茶", "黒糖タピオカミルクティー"], ["Milk tea with brown sugar syrup and warm tapioca pearls.", "흑설탕 시럽과 따뜻한 타피오카 펄을 넣은 밀크티.", "黑糖糖浆配温热珍珠的奶茶。", "黒糖シロップと温かいタピオカ入りのミルクティー。"], "sữa tươi trân châu đường đen"],
  ["Trà sữa matcha", "chah sue-ah mat-chah", 0, "dairy", ["Matcha milk tea", "말차 밀크티", "抹茶奶茶", "抹茶ミルクティー"], ["Green tea powder whisked with milk and sugar, over ice.", "말차 가루를 우유, 설탕과 섞어 얼음과 함께.", "抹茶粉调入牛奶和糖，加冰。", "抹茶を牛乳と砂糖で溶いて氷と一緒に。"], "matcha sữa"],
  ["Trà sữa khoai môn", "chah sue-ah kwai mon", 0, "dairy", ["Taro milk tea", "타로 밀크티", "芋头奶茶", "タロイモミルクティー"], ["Creamy purple taro milk tea.", "부드러운 보라색 타로 밀크티.", "香浓紫色芋头奶茶。", "クリーミーな紫色のタロイモミルクティー。"]],
  ["Trà sữa Thái xanh", "chah sue-ah tie sahn", 0, "dairy", ["Thai green milk tea", "태국식 그린 밀크티", "泰式绿奶茶", "タイ風グリーンミルクティー"], ["Fragrant Thai green tea with condensed milk.", "연유를 넣은 향긋한 태국식 녹차.", "加炼乳的泰式绿茶。", "練乳入りの香り高いタイ風グリーンティー。"], "trà thái xanh"],
  ["Trà sữa Thái đỏ", "chah sue-ah tie daw", 0, "dairy", ["Thai red milk tea", "태국식 밀크티", "泰式红奶茶", "タイ風ミルクティー"], ["Orange Thai black tea with condensed milk.", "연유를 넣은 주황빛 태국식 홍차.", "加炼乳的泰式红茶。", "練乳入りのオレンジ色のタイ風紅茶。"], "trà thái đỏ|trà thái"],
  ["Trà sữa ô long", "chah sue-ah oh long", 0, "dairy", ["Oolong milk tea", "우롱 밀크티", "乌龙奶茶", "烏龍ミルクティー"], ["Roasted oolong tea with milk.", "볶은 우롱차에 우유.", "焙火乌龙茶加牛奶。", "焙煎烏龍茶にミルク。"], "trà sữa oolong"],
  ["Hồng trà sữa", "hong chah sue-ah", 0, "dairy", ["Black milk tea", "홍차 밀크티", "红茶奶茶", "紅茶ミルクティー"], ["Classic black tea with milk.", "클래식 홍차 밀크티.", "经典红茶奶茶。", "定番の紅茶ミルクティー。"]],
  ["Trà ô long", "chah oh long", 0, "", ["Oolong tea", "우롱차", "乌龙茶", "烏龍茶"], ["Lightly roasted oolong tea, hot or iced.", "살짝 볶은 우롱차, 따뜻하게 또는 차갑게.", "轻焙乌龙茶，冷热皆可。", "軽く焙煎した烏龍茶。ホットかアイスで。"], "trà oolong"],
  ["Trà vải", "chah vai", 0, "", ["Lychee tea", "리치 티", "荔枝茶", "ライチティー"], ["Iced tea with lychee syrup and whole lychees.", "리치 시럽과 리치 과육을 넣은 아이스티.", "荔枝糖浆加荔枝果肉的冰茶。", "ライチシロップと果肉入りのアイスティー。"]],
  ["Trà dâu", "chah yow", 0, "", ["Strawberry tea", "딸기 티", "草莓茶", "いちごティー"], ["Iced fruit tea with strawberries.", "딸기를 넣은 아이스 과일차.", "草莓水果冰茶。", "いちご入りのアイスフルーツティー。"]],
  ["Trà chanh dây", "chah chahn yay", 0, "", ["Passion fruit tea", "패션프루트 티", "百香果茶", "パッションフルーツティー"], ["Iced tea with fresh passion fruit.", "생 패션프루트를 넣은 아이스티.", "加新鲜百香果的冰茶。", "生パッションフルーツ入りのアイスティー。"]],
  ["Trà xoài", "chah swy", 0, "", ["Mango tea", "망고 티", "芒果茶", "マンゴーティー"], ["Iced fruit tea with ripe mango.", "잘 익은 망고를 넣은 아이스 과일차.", "加熟芒果的水果冰茶。", "完熟マンゴー入りのアイスフルーツティー。"]],
  ["Trà ổi hồng", "chah oy hong", 0, "", ["Pink guava tea", "핑크 구아바 티", "红心番石榴茶", "ピンクグァバティー"], ["Iced tea with pink guava.", "핑크 구아바를 넣은 아이스티.", "加红心番石榴的冰茶。", "ピンクグァバ入りのアイスティー。"]],
  ["Matcha latte", "mat-chah lah-teh", 0, "dairy", ["Matcha latte", "말차 라떼", "抹茶拿铁", "抹茶ラテ"], ["Matcha green tea with milk, hot or iced.", "말차에 우유, 따뜻하게 또는 차갑게.", "抹茶加牛奶，冷热皆可。", "抹茶にミルク。ホットかアイスで。"]],
  ["Cacao sữa", "kah-kow sue-ah", 0, "dairy", ["Cocoa with milk", "코코아 라떼", "可可牛奶", "ココアミルク"], ["Vietnamese cocoa with milk, hot or iced.", "베트남 코코아에 우유, 따뜻하게 또는 차갑게.", "越南可可加牛奶，冷热皆可。", "ベトナムカカオにミルク。ホットかアイスで。"], "ca cao sữa|cacao"],
  ["Latte", "lah-teh", 0, "dairy", ["Café latte", "카페 라떼", "拿铁", "カフェラテ"], ["Espresso with steamed milk.", "에스프레소에 스팀 우유.", "浓缩咖啡加蒸奶。", "エスプレッソにスチームミルク。"], "cà phê latte|cafe latte"],
  ["Cappuccino", "kah-poo-chee-noh", 0, "dairy", ["Cappuccino", "카푸치노", "卡布奇诺", "カプチーノ"], ["Espresso with steamed milk and thick foam.", "에스프레소에 스팀 우유와 풍성한 거품.", "浓缩咖啡加蒸奶和厚奶泡。", "エスプレッソにスチームミルクと厚い泡。"]],
  ["Americano", "ah-meh-ree-kah-noh", 0, "", ["Americano", "아메리카노", "美式咖啡", "アメリカーノ"], ["Espresso topped up with water.", "에스프레소에 물을 더한 커피.", "浓缩咖啡加水。", "エスプレッソをお湯で割ったもの。"]],
  ["Espresso", "es-pres-soh", 0, "", ["Espresso", "에스프레소", "浓缩咖啡", "エスプレッソ"], ["A short, strong shot of coffee.", "짧고 진한 커피 한 샷.", "一小杯浓烈的咖啡。", "短く濃いコーヒーのショット。"]],
  ["Cold brew", "kohld broo", 0, "", ["Cold brew coffee", "콜드브루", "冷萃咖啡", "コールドブリュー"], ["Coffee steeped cold for hours, smooth and strong.", "몇 시간 동안 차갑게 우려 부드럽고 진한 커피.", "冷水长时间萃取，顺滑浓郁。", "数時間かけて水出しした、まろやかで濃いコーヒー。"]],
  ["Cà phê phin", "kah feh fin", 0, "", ["Vietnamese drip coffee", "베트남 핀 커피", "越南滴漏咖啡", "ベトナム式ドリップコーヒー"], ["Strong coffee slowly dripped through a metal phin filter.", "금속 핀 필터로 천천히 내린 진한 커피.", "用金属滴漏壶慢慢滴出的浓咖啡。", "金属のフィンでゆっくり淹れた濃いコーヒー。"]],
  ["Soda chanh", "soh-dah chahn", 0, "", ["Lime soda", "라임 소다", "青柠苏打", "ライムソーダ"], ["Fresh lime with soda water and sugar.", "생 라임에 탄산수와 설탕.", "鲜青柠加苏打水和糖。", "生ライムにソーダと砂糖。"], "soda"],
  ["Nước ép dưa hấu", "noo-uk ep yoo-ah hoh", 0, "", ["Watermelon juice", "수박 주스", "西瓜汁", "スイカジュース"], ["Freshly pressed watermelon juice.", "갓 짠 수박 주스.", "现榨西瓜汁。", "搾りたてのスイカジュース。"], "ép dưa hấu|nước dưa hấu"],
  ["Nước ép thơm", "noo-uk ep tum", 0, "", ["Pineapple juice", "파인애플 주스", "菠萝汁", "パイナップルジュース"], ["Freshly pressed pineapple juice.", "갓 짠 파인애플 주스.", "现榨菠萝汁。", "搾りたてのパイナップルジュース。"], "ép thơm|nước ép dứa"],
  ["Nước ép cà rốt", "noo-uk ep kah rot", 0, "", ["Carrot juice", "당근 주스", "胡萝卜汁", "にんじんジュース"], ["Freshly pressed carrot juice.", "갓 짠 당근 주스.", "现榨胡萝卜汁。", "搾りたてのにんじんジュース。"], "ép cà rốt"],
  ["Nước ép ổi", "noo-uk ep oy", 0, "", ["Guava juice", "구아바 주스", "番石榴汁", "グァバジュース"], ["Freshly pressed guava juice.", "갓 짠 구아바 주스.", "现榨番石榴汁。", "搾りたてのグァバジュース。"], "ép ổi"],
  ["Nước ép táo", "noo-uk ep tow", 0, "", ["Apple juice", "사과 주스", "苹果汁", "りんごジュース"], ["Freshly pressed apple juice.", "갓 짠 사과 주스.", "现榨苹果汁。", "搾りたてのりんごジュース。"], "ép táo"],
  ["Bia Sài Gòn", "bee-ah sigh gone", 0, "gluten", ["Saigon beer", "사이공 맥주", "西贡啤酒", "サイゴンビール"], ["Local lager, served cold, often with ice.", "얼음과 함께 차갑게 마시는 현지 라거.", "本地拉格啤酒，冰镇，常加冰块。", "地元のラガー。冷やして、氷入りで飲むことも。"], "bia saigon"],
  ["Bia 333", "bee-ah bah bah bah", 0, "gluten", ["333 beer", "333 맥주", "333啤酒", "333ビール"], ["Light local lager, served cold.", "차갑게 마시는 가벼운 현지 라거.", "清爽本地拉格啤酒，冰镇。", "軽めの地元ラガー、冷やして。"]],
  ["Bia Tiger", "bee-ah tie-ger", 0, "gluten", ["Tiger beer", "타이거 맥주", "虎牌啤酒", "タイガービール"], ["Lager, served cold.", "차갑게 마시는 라거.", "拉格啤酒，冰镇。", "ラガービール、冷やして。"]],
  ["Nước ngọt", "noo-uk ngot", 0, "", ["Soft drink", "탄산음료", "汽水", "ソフトドリンク"], ["Canned soft drink such as Coca-Cola or 7Up.", "코카콜라나 세븐업 같은 캔 탄산음료.", "罐装汽水，如可口可乐或七喜。", "コカ・コーラやセブンアップなどの缶ジュース。"], "coca|coca cola|pepsi|7up"],
  ["Nước suối", "noo-uk soo-oy", 0, "", ["Bottled water", "생수", "矿泉水", "ミネラルウォーター"], ["Bottled drinking water.", "병에 든 생수.", "瓶装饮用水。", "ボトル入りの水。"], "nước lọc|nước khoáng"],
  ["Sữa tươi", "sue-ah too-ee", 0, "dairy", ["Fresh milk", "우유", "鲜奶", "牛乳"], ["Cold fresh milk.", "차가운 우유.", "冰鲜牛奶。", "冷たい牛乳。"]],
];

export interface DishInfo {
  vi: string;
  /** Drinks get size, sugar and ice options in café and milk-tea shops. */
  drink: boolean;
  pron: string;
  spice: number;
  alg: Allergen[];
  name: ML;
  desc: ML;
}

const ml = ([en, ko, zh, ja]: [string, string, string, string]): ML => ({ en, ko, zh, ja });

/**
 * Normalises a Vietnamese dish name for matching: no tone marks, no portion notes
 * in brackets, no prices or punctuation. "Phở Bò Tái (tô lớn) 45k" → "pho bo tai"; "Bia 333" keeps its number.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\d+(?:[.,]\d{3})*\s*(?:k|d|vnd|dong)\b|\d{4,}|\d+(?:[.,]\d{3})+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:to|ly|chen|dia|phan|suat)?\s*(?:lon|nho|vua)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX = new Map<string, DishInfo>();
// Everything from "Cà phê sữa đá" down is a drink.
const DRINKS_FROM = ROWS.findIndex((r) => r[0] === "Cà phê sữa đá");
for (const [k, [vi, pron, spice, alg, names, descs, other]] of ROWS.entries()) {
  const info: DishInfo = {
    vi,
    drink: DRINKS_FROM >= 0 && k >= DRINKS_FROM,
    pron,
    spice,
    alg: alg.split(" ").filter((a): a is Allergen => ALLERGEN_KEYS.includes(a as Allergen)),
    name: ml(names),
    desc: ml(descs),
  };
  for (const k of [vi, ...(other ? other.split("|") : [])]) {
    const key = normalize(k);
    if (!INDEX.has(key)) INDEX.set(key, info);
  }
}

/** How many dishes the built-in list covers (for the UI). */
export const DISH_COUNT = ROWS.length;

/** Looks up a dish by its Vietnamese name. Returns null when it isn't on the list. */
export function lookupDish(vi: string): DishInfo | null {
  return INDEX.get(normalize(vi)) ?? null;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Like lookupDish, but forgives what a photo reader gets wrong: missing spaces and a letter or two
 * ("Phở bò tá", "Bunbo Hue"). Used for photographed menus only; returns a match only when it is the
 * single closest one.
 */
export function lookupDishLoose(vi: string): DishInfo | null {
  const exact = lookupDish(vi);
  if (exact) return exact;
  const key = normalize(vi).replace(/ /g, "");
  if (key.length < 4) return null;
  const allowed = key.length >= 10 ? 2 : 1;
  let best: DishInfo | null = null;
  let bestD = allowed + 1;
  let tie = false;
  for (const [k, info] of INDEX) {
    const d = editDistance(key, k.replace(/ /g, ""));
    if (d < bestD) { best = info; bestD = d; tie = false; }
    else if (d === bestD && info !== best) tie = true;
  }
  return bestD <= allowed && !tie ? best : null;
}

/**
 * Fills in a dish's translations from the built-in list, keeping the vendor's own name and price.
 * In a café or milk-tea shop, a drink without options also gets the shop's default options.
 */
export function fillFromList(d: Dish, kind: ShopKind = "food"): Dish | null {
  const hit = lookupDish(d.vi);
  if (!hit) return null;
  const opts = d.opts ?? (hit.drink ? defaultOpts(kind, d.price) : null);
  return { ...d, pron: hit.pron, spice: hit.spice, alg: [...hit.alg], name: { ...hit.name }, desc: { ...hit.desc }, opts };
}
