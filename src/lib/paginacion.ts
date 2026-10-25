/** Datos de paginación de las respuestas `paginado(...)` (src/docs/registry.ts). */
export const paginacion = (pagina: number, por_pagina: number, total: number) => ({
  pagina,
  por_pagina,
  total,
  total_paginas: Math.ceil(total / por_pagina),
});

/** skip/take de Prisma para una página (desde 1). */
export const rangoDePagina = (pagina: number, por_pagina: number) => ({
  skip: (pagina - 1) * por_pagina,
  take: por_pagina,
});
