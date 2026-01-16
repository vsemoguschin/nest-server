type NeonLike =
  | {
      color?: string | null;
      width?: string | null;
    }
  | null
  | undefined;

type LightingLike =
  | {
      color?: string | null;
    }
  | null
  | undefined;

export type OrderLikeForWarnings =
  | {
      type?: string | null;
      holeType?: string | null;
      fitting?: string | null;
      laminate?: string | null;
      acrylic?: string | null;
      isAcrylic?: boolean | null;
      docs?: boolean | null;
      print?: boolean | null;
      dimmer?: boolean | null;
      boardHeight?: number | null;
      boardWidth?: number | null;
      neons?: NeonLike[] | null;
      lightings?: LightingLike[] | null;
    }
  | null
  | undefined;

export type DeliveryLikeForWarnings =
  | {
      method?: string | null;
      type?: string | null;
    }
  | null
  | undefined;

export type PaymentLikeForWarnings =
  | {
      method?: string | null;
      price?: number | null;
    }
  | null
  | undefined;

export function collectTaskWarnings(
  orders: OrderLikeForWarnings[] | null | undefined,
  deliveries: DeliveryLikeForWarnings[] | null | undefined,
  chatLink: string | null | undefined,
  payments?: PaymentLikeForWarnings[] | null | undefined,
): string[] {
  const warnings = new Set<string>();

  for (const order of orders ?? []) {
    if (!order) continue;

    const type = order.type?.trim();
    if (type) warnings.add(type);

    const holeType = order.holeType?.trim();
    if (holeType) warnings.add('Отверстия ' + holeType);

    const fitting = order.fitting;
    if (
      typeof fitting === 'string' &&
      fitting.toLowerCase().includes('держатели')
    ) {
      warnings.add(fitting);
    }

    const laminate = order.laminate?.trim();
    if (laminate) warnings.add(laminate);

    if (order.print) {
      warnings.add('Цветная подложка');
    }

    // const acrylicRaw = order.acrylic;
    if (order.isAcrylic) {
      warnings.add('Акрил');
    }

    if (order.docs) warnings.add('Документы');
    if (order.dimmer) warnings.add('Диммер');

    for (const neon of order.neons ?? []) {
      const color = neon?.color?.trim().toLowerCase();
      if (color === 'rgb') warnings.add('РГБ');
      if (color === 'смарт') warnings.add('Смарт');

      const width = neon?.width?.trim().toLowerCase();
      if (width === '8мм') warnings.add('8мм неон');
    }

    for (const lighting of order.lightings ?? []) {
      const color = lighting?.color?.trim().toLowerCase();
      if (!color) continue;
      if (color === 'rgb') {
        warnings.add('РГБ подсветка');
      } else {
        warnings.add('Подсветка');
      }
    }

    const boardHeight =
      typeof order.boardHeight === 'number' ? order.boardHeight : null;
    const boardWidth =
      typeof order.boardWidth === 'number' ? order.boardWidth : null;

    if (
      (boardHeight !== null && boardHeight > 200) ||
      (boardWidth !== null && boardWidth > 200) ||
      (boardHeight !== null &&
        boardWidth !== null &&
        boardHeight > 150 &&
        boardWidth > 150)
    ) {
      warnings.add('Большой размер подложки');
    }
  }

  for (const del of deliveries ?? []) {
    if (!del) continue;

    const type = del.type?.trim();
    if (type) warnings.add('Доставка ' + type);

    const method = del.method?.trim();
    if (method) warnings.add(method);
  }

  if (
    typeof chatLink === 'string' &&
    chatLink.toLowerCase().includes('bluesales.ru')
  ) {
    warnings.add('РОП1');
  }

  // Проверка платежей с методом "Наложка"
  if (payments && payments.length > 0) {
    const hasNalojka = payments.some((payment) => {
      const method = String(payment?.method ?? '')
        .trim()
        .toLowerCase();
      return method.includes('наложка');
    });
    if (hasNalojka) {
      warnings.add('НАЛОЖЕННЫЙ ПЛАТЁЖ');
    }
  }

  return Array.from(warnings);
}
