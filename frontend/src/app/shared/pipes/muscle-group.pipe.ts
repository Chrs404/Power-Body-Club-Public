import { Pipe, PipeTransform } from '@angular/core';
import { MuscleGroup, MUSCLE_GROUP_LABELS } from '../../core/models/exercise.model';

@Pipe({ name: 'muscleGroup' })
export class MuscleGroupPipe implements PipeTransform {
  transform(value: MuscleGroup | string | null | undefined): string {
    if (!value) return '';
    return MUSCLE_GROUP_LABELS[value as MuscleGroup] ?? value;
  }
}
