import { Pipe, PipeTransform } from '@angular/core';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
// Hebrew ICU appends the number to its word forms: "לפני שעתיים (2)".
const relative = {
  format: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    rtf.format(value, unit).replace(/ \(\d+\)$/, ''),
};

@Pipe({ name: 'dateCreated' })
export class DateCreatedPipe implements PipeTransform {
  transform(dateCreated: number | undefined): string {
    if (!dateCreated) {
      return '';
    }
    const diff = Date.now() - dateCreated;
    if (diff > WEEK) return new Date(dateCreated).toLocaleDateString('he-IL');
    if (diff > DAY) return relative.format(-Math.round(diff / DAY), 'day');
    if (diff > HOUR) return relative.format(-Math.round(diff / HOUR), 'hour');
    if (diff > MINUTE) return relative.format(-Math.round(diff / MINUTE), 'minute');
    return 'הרגע';
  }
}
