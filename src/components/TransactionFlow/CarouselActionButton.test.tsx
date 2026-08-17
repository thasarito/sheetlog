import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CarouselActionButton } from './CarouselActionButton';

describe('CarouselActionButton', () => {
  it('owns its pointer gesture without activating after a horizontal drag', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onParentPointerDown = vi.fn();

    render(
      <div onPointerDown={onParentPointerDown}>
        <CarouselActionButton type="button" onClick={onClick}>
          View all
        </CarouselActionButton>
      </div>,
    );

    const action = screen.getByRole('button', { name: 'View all' });
    expect(action.className).toContain('[touch-action:pan-y]');

    fireEvent.pointerDown(action, { pointerId: 1, clientX: 250, clientY: 80 });
    fireEvent.pointerMove(action, { pointerId: 1, clientX: 120, clientY: 84 });
    fireEvent.pointerUp(action, { pointerId: 1, clientX: 120, clientY: 84 });
    fireEvent.click(action);

    expect(onParentPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    await user.click(action);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
