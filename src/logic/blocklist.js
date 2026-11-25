// Words Soupspell never accepts: slurs and a few crude insults. The game should never throw confetti for one of these.
// tools/pack-words.mjs leaves them out of data/words.txt, and createDict() refuses them even if they sneak back in.
// Exact words only (no stems), so "spicy" and "jewel" stay playable.
export const BLOCKLIST = `
abo abos bohunk bohunks chink chinks chinky chinkier chinkiest coon coons cunt cunts dago dagoes dagos darkey darkeys darkie darkies darky
dyke dykes dykey fag fags faggot faggots faggoty faggy faggotry gook gooks gooky gyp gyps gypped gypper gyppers gypping hebe hebes
homo homos honkey honkeys honkie honkies honky jew jewed jewing jews jigaboo jigaboos kike kikes kraut krauts lezzes lezzie lezzies lezzy
mick micks mongol mongols mongoloid nigger niggers papist papists pickaninny rape raped raper rapers rapes raping rapist rapists
redskin redskins retard retards retarded retardate sambo sambos shegetz shiksa shiksas slut sluts slutty sluttier sluttish spaz spazzes
spic spics spick spicks squaw squaws twat twats wetback wetbacks whore whores whored wop wops yid yids
`.trim().split(/\s+/)

export const BLOCKED = new Set(BLOCKLIST)
