<script setup lang="ts">
import { computed } from 'vue';

/**
 * Text control owned by this component. The page passes the draft object and
 * a field name; it does not read the value in its own template, so a keystroke
 * re-renders this field and not the rest of the page. v-model stays on the
 * native input so typing and paste (including IME) keep the #56 behavior.
 */
const props = withDefaults(
  defineProps<{
    model: Record<string, any>;
    field: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { type: 'text', placeholder: '', disabled: false },
);

const emit = defineEmits<{
  blur: [event: Event];
  input: [event: Event];
}>();

const value = computed({
  get() {
    const current = props.model?.[props.field];
    return current == null ? '' : current;
  },
  set(next: string | number) {
    if (props.model) props.model[props.field] = next;
  },
});
</script>

<template>
  <input
    class="input"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    v-model="value"
    @blur="emit('blur', $event)"
    @input="emit('input', $event)"
  />
</template>
