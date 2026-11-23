// SPDX-License-Identifier: Apache-2.0
import html from "./page.html";
export const PAGE = (radar: string) => (html as string).replace("__RADAR__", radar);
