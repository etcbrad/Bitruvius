import { strict as assert } from 'node:assert';

import { FK_ONLY_UI } from '../../client/src/app/constants';
import { WIDGET_TAB_ORDER } from '../../client/src/app/widgets/registry';

export const runFkOnlyUiTests = () => {
  const hidden = ['rig_controls', 'responsiveness', 'atomic_units'] as const;

  if (FK_ONLY_UI) {
    assert.equal(WIDGET_TAB_ORDER.physics.length, 0, 'FK-only should hide Physics widgets');

    const all = [
      ...WIDGET_TAB_ORDER.character,
      ...WIDGET_TAB_ORDER.physics,
      ...WIDGET_TAB_ORDER.animation,
      ...WIDGET_TAB_ORDER.global,
    ];
    for (const id of hidden) {
      assert.ok(!all.includes(id), `FK-only should not surface widget "${id}" in tab order`);
    }
  } else {
    for (const id of hidden) {
      assert.ok(
        WIDGET_TAB_ORDER.physics.includes(id),
        `Non-FK-only should include widget "${id}" under Physics tab`,
      );
    }
  }
};

