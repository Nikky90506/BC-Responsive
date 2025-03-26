import { BaseModule } from "../Base/BaseModule";
import { isSimpleChat } from "../Utilities/ChatMessages";
import { PlayerStorage } from "../Utilities/Data";
import { HookPriority, ModuleCategory, hookFunction } from "../Utilities/SDK";

/**
 * "Frown", "Sad", "Pained", "Angry", "HalfOpen", "Open", "Ahegao", "Moan",
 * "TonguePinch", "LipBite", "Happy", "Devious", "Laughing", "Grin", "Smirk", "Pout",
 */

/**
 * The detection map used to match chunks of speech to a character's facial expression.
 * It's sorted by priority.
 */
const letterExpressionMap: { regex: RegExp; expr: [ExpressionName | null, number]; }[] = [
  { regex: /[.?!…~]/, expr: [null, 600] },
  { regex: /[,;]/, expr: [null, 250] },
  //Latin
  { regex: /[a]/i, expr: ["Open", 400] },
  { regex: /[oeu]/i, expr: ["HalfOpen", 300] },
  { regex: /[bp]/i, expr: [null, 200] },
  { regex: /[mn]/i, expr: [null, 500] },
  { regex: /[ij]/i, expr: ["Smirk", 400] },
  { regex: /[kqrw]/i, expr: ["HalfOpen", 300] },
  { regex: /[fv]/i, expr: ["LipBite", 300] },
  { regex: /[cdt]/i, expr: ["TonguePinch", 200] },
  { regex: /[slz]/i, expr: ["TonguePinch", 400] },
  { regex: /[ghx]/i, expr: ["Angry", 300] },
  //Cyrillic
  { regex: /[ая]/i, expr: ["Open", 400] },
  { regex: /[оеуєю]/i, expr: ["HalfOpen", 300] },
  { regex: /[бп]/i, expr: [null, 200] },
  { regex: /[мн]/i, expr: [null, 500] },
  { regex: /[иіжїы]/i, expr: ["Smirk", 400] },
  { regex: /[yкр]/i, expr: ["HalfOpen", 300] },
  { regex: /[фв]/i, expr: ["LipBite", 300] },
  { regex: /[цдт]/i, expr: ["TonguePinch", 200] },
  { regex: /[слз]/i, expr: ["TonguePinch", 400] },
  { regex: /[гх]/i, expr: ["Angry", 300] }
];

interface CharTalkCharacterData {
  realExpression: ExpressionName | null;
  currentExpression: ExpressionName | null;
  /** The list of expressions to animate with their duration. */
  animation: [ExpressionName | null, number][];
  animationFrame: number;
}

export class CharTalkModule extends BaseModule {
  static characterData: Record<number, CharTalkCharacterData> = {};

  Load(): void {
    ChatRoomRegisterMessageHandler({
      Description: "Processes mouth moving on the client",
      Priority: 500,
      Callback: (data, sender, msg) => {
        if (data.Type === "Chat") CharTalkModule.charTalkHandle(sender, msg);

        return false;
      }
    });

    hookFunction(
      "CommonDrawAppearanceBuild",
      HookPriority.Observe,
      (args, next) => {
        const c: Character = args[0];
        const charData = CharTalkModule.characterData[c.MemberNumber]; // Skip hook execution if animation not running
        if (!charData) return next(args);

        const mouth = InventoryGet(c, "Mouth"); // Get mouth property

        if (!mouth) return next(args);

        if (!mouth.Property) mouth.Property = {};

        charData.realExpression = mouth.Property.Expression ?? null; // Save the real expression
        mouth.Property.Expression = charData.currentExpression ?? null; // Override the expression for this function

        const returnValue = next(args); // Call the hooked function
        mouth.Property.Expression = charData.realExpression; // Restore the real expression for further execution
        return returnValue; // Preserve any possible return value
      },
      ModuleCategory.CharTalk
    );
  }

  /**
   * Gets the sent message, checks it for validity,
   * then splits it in chunks and turns it into a list of expression changes
   * before pushing them into the animator.
   */
  static animateSpeech(c: Character, msg: string) {
    const chunks = msg.match(/.{1,3}/g) || [];
    const animation: [ExpressionName | null, number][] = chunks.map(chunk => {
      const match = letterExpressionMap.find(({ regex }) => regex.test(chunk)) ?? { expr: [null, 200] };
      return match.expr;
    });

    CharTalkModule.runExpressionAnimation(c, animation);
  }


  /**
   * Runs animation by changing mouth expression every `step[1]`ms
   */
  static runExpressionAnimationStep(c: Character) {
    const charData = CharTalkModule.characterData[c.MemberNumber];

    if (!charData.animation) return;

    let step = charData.animation[charData.animationFrame++];

    CharTalkModule.setLocalMouthExpression(c, step?.[0]);

    if (charData.animationFrame < charData.animation?.length) {
      setTimeout(() => CharTalkModule.runExpressionAnimationStep(c), step[1]);
    } else {
      CharTalkModule.cleanup(c);
    }
  }

  static runExpressionAnimation(c: Character, list: [ExpressionName | null, number][]) {
    if (CharTalkModule.characterData[c.MemberNumber]) return;

    CharTalkModule.characterData[c.MemberNumber] = {
      realExpression: null,
      currentExpression: null,
      animation: list,
      animationFrame: 0
    };

    CharTalkModule.runExpressionAnimationStep(c);
  }


  static setLocalMouthExpression(c: Character, expressionName: ExpressionName | null) {
    const mouth = InventoryGet(c, "Mouth");
    if (!mouth || (expressionName && !mouth.Asset.Group.AllowExpression.includes(expressionName))) return;

    CharTalkModule.characterData[c.MemberNumber].currentExpression = expressionName;

    CharacterRefresh(c, false);
  }

  static charTalkHandle(c: Character, msg: string) {
    const storage = PlayerStorage().GlobalModule;
    if (!storage.ResponsiveEnabled || !storage.CharTalkEnabled || !c || CharTalkModule.characterData[c.MemberNumber]) return;

    if (isSimpleChat(msg)) {
      CharTalkModule.animateSpeech(c, msg);
    }
  }

  static cleanup(c: Character) {
    if (!CharTalkModule.characterData[c.MemberNumber]) return;
    CharTalkModule.setLocalMouthExpression(c, CharTalkModule.characterData[c.MemberNumber].realExpression);
    delete CharTalkModule.characterData[c.MemberNumber];
  }
}
