// Registramos o módulo de tradução e todos os conversores customizados após a inicialização do Babele.
Hooks.once('babele.init', (babele) => {
  babele.register({
    module: 'kox-traducoes-daggerheart',
    lang: 'pt-BR',
    dir: 'compendiums'
  });

  // O Foundry armazena diferentes tipos de compêndios de formas distintas:
  // pacotes de Item (classes, domínios) contêm apenas system.* e são tratados
  // por um mapeamento simples, enquanto pacotes de Actor (inimigos, ambientes)
  // incluem um array de Items embutidos.
  // As funções auxiliares abaixo ajudam a aplicar traduções nas partes
  // onde o Babele não atua automaticamente (itens embutidos, nós de ação,
  // listas de vantagens).

  // Atualiza uma única ação (name/description) com base na tradução.
  const updateActionNode = (action, translated) => {
    if (!action || !translated || typeof translated !== "object") {
      return;
    }
    const { name, description } = translated;
    if (name) {
      action.name = name;
    }
    if (description) {
      action.description = description;
    }
    applyCountdownTranslations(action.countdown, translated.countdown);
  };

  // Aplica a tradução a um efeito, incluindo sources de vantagem/desvantagem aninhados.
  const updateEffectNode = (effect, translated) => {
    if (!effect || !translated || typeof translated !== "object") {
      return;
    }
    const { name, description } = translated;
    if (name) {
      effect.name = name;
    }
    if (description) {
      effect.description = description;
    }
    applySourceTranslations(effect, translated.advantageSources, "system.advantageSources");
    applySourceTranslations(effect, translated.disadvantageSources, "system.disadvantageSources");
  };

  // Aplica nomes/descrições traduzidos aos nós de ação com base em seus IDs.
  const applyActionTranslations = (actions, translatedActions) => {
    if (!actions || !translatedActions || typeof translatedActions !== "object") {
      return;
    }
    for (const [actionId, action] of Object.entries(actions)) {
      updateActionNode(action, translatedActions[actionId]);
    }
  };

  // Sincroniza o array de efeitos com as traduções, incluindo advantageSources.
  const applyEffectTranslations = (effects, translatedEffects) => {
    if (!Array.isArray(effects) || !translatedEffects || typeof translatedEffects !== "object") {
      return;
    }
    for (const effect of effects) {
      if (!effect) continue;
      const effectId = typeof effect._id === "string" ? effect._id : null;
      if (!effectId) continue;
      updateEffectNode(effect, translatedEffects[effectId]);
    }
  };

  // Substitui strings de advantage/disadvantageSources dentro de effect.changes
  // pelos valores traduzidos.
  const applySourceTranslations = (effect, replacementMap, targetKey) => {
    if (!effect || !replacementMap || typeof replacementMap !== "object") {
      return;
    }
    const changes = Array.isArray(effect.changes) ? effect.changes : [];
    for (const change of changes) {
      if (!change || change.key !== targetKey) {
        continue;
      }
      const current = typeof change.value === "string" ? change.value : "";
      if (!current) {
        continue;
      }
      const candidate = replacementMap[current];
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed) {
        change.value = trimmed;
      }
    }
  };

  // Aplica traduções aos nomes dos passos de contagem dentro de action.countdown.
  const applyCountdownTranslations = (countdownList, translatedMap) => {
    if (!Array.isArray(countdownList) || !translatedMap || typeof translatedMap !== "object") {
      return;
    }
    for (const node of countdownList) {
      if (!node || typeof node.name !== "string") {
        continue;
      }
      const translatedName = translatedMap[node.name];
      if (typeof translatedName !== "string") {
        continue;
      }
      const trimmed = translatedName.trim();
      if (trimmed) {
        node.name = trimmed;
      }
    }
  };

  Babele.get().registerConverters({
    /**
     * Documentos Actor (inimigos, ambientes) armazenam suas habilidades
     * em um array de items.
     * Precisamos percorrê-los manualmente e atualizar cada registro pelo _id.
     */
    "toItemsWithActions": (origItems, transItems) => {
      if (!Array.isArray(origItems) || !transItems) {
        return origItems;
      }
      for (const item of origItems) {
        if (!item) {
          continue;
        }
        const translation = transItems[item._id];
        if (!translation) {
          continue;
        }
        if (translation.name) {
          item.name = translation.name;
        }
        const system = item.system;
        if (!system) {
          continue;
        }
        const desc = translation.description;
        if (desc) {
          system.description = desc;
        }
        applyActionTranslations(system.actions, translation.actions);
        applyEffectTranslations(item.effects, translation.effects);
      }
      return origItems;
    },

    /**
     * Pacotes de Item (classes, domínios, armas etc.) são, por si só,
     * Items do Foundry, e suas ações ficam em system.actions.
     */
    "toActions": (origActions, transActions) => {
      applyActionTranslations(origActions, transActions);
      return origActions;
    },

    /**
     * Mapeia os efeitos pelo _id e aplica as traduções.
     */
    "toEffects": (origEffects, transEffects) => {
      applyEffectTranslations(origEffects, transEffects);
      return origEffects;
    },

    /**
     * As vantagens em formas bestiais no Foundry são armazenadas como
     * um objeto {id: { value }}.
     * Já nas traduções temos apenas uma lista de strings, então o conversor
     * aplica essas strings no campo value seguindo a mesma ordem.
     */
    "toAdvantageList": (origObj, values) => {
      if (!Array.isArray(values)) {
        return origObj;
      }
      Object.keys(origObj).forEach((id, index) => {
        const node = origObj[id];
        const replacement = values[index];
        if (!node || typeof node.value !== "string" || typeof replacement !== "string") {
          return;
        }
        const trimmed = replacement.trim();
        if (trimmed) {
          node.value = trimmed;
        }
      });
      return origObj;
    },

    /**
     * Atualiza os rótulos de adversários potenciais em ambientes.
     */
    "toPotentialAdversaries": (origGroups, translatedGroups) => {
      if (!origGroups || typeof origGroups !== "object" || !translatedGroups || typeof translatedGroups !== "object") {
        return origGroups;
      }
      for (const [groupId, group] of Object.entries(origGroups)) {
        if (!group || typeof group !== "object") continue;
        const translation = translatedGroups[groupId];
        if (!translation || typeof translation.label !== "string") continue;
        const trimmed = translation.label.trim();
        if (trimmed) {
          group.label = trimmed;
        }
      }
      return origGroups;
    }
  });
});
