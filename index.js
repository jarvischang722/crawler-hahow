const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const XLSX = require("XLSX");
const MAIN_HOST = "https://hahow.in";
let page = null;
puppeteer.launch({headless: true, args: ["--start-maximized"]}).then(async browser => {
	// (async () => {
	// const browser = await puppeteer.launch();
	page = await browser.newPage();
	await page.setViewport({
		width: 1920,
		height: 800,
	});
	await page.goto(MAIN_HOST);
	await page.waitFor(1000);

	const menuCategoryList = await getMenuCategoryList();

	for (let categoryInfo of menuCategoryList) {
		console.log(`====== 類別 : ${categoryInfo.categoryName} ======`);
		await exportCourseByCategory(categoryInfo);
	}

	await page.waitFor(2000);
	await browser.close();
});

async function getMenuCategoryList() {
	await page.hover(".explore-courses");

	await page.waitFor(2000);

	const mainMenuHtml = await page.$eval(".sc-fAjcbJ", el => el.innerHTML);

	let $ = cheerio.load(mainMenuHtml);
	const mainCategoryList = [];

	$('li[role="presentation"]').each((idx, el) => {
		if (idx > 0) {
			const categoryName = $(el)
				.find("a")
				.text();
			const categoryUrlPath = $(el)
				.find("a")
				.attr("href");
			mainCategoryList.push({
				categoryName: categoryName,
				categoryUrlPath: categoryUrlPath,
			});
		}
	});
	for (let cIdx = 0; cIdx < mainCategoryList.length; cIdx++) {
		const categoryInfo = mainCategoryList[cIdx];
		const {categoryName, categoryUrlPath} = categoryInfo;
		await page.hover(`a[href='${categoryUrlPath}']`);
		await page.waitFor(500);
		const courseSubMenuHtml = await page.$eval(".sc-fAjcbJ", el => el.innerHTML);
		$ = cheerio.load(courseSubMenuHtml, {decodeEntities: false});

		const subCategoryEl = $(".sc-kgAjT").eq(1);

		const subCategoryList = [];
		subCategoryEl.find("li").each((idx, el) => {
			const subCategoryName = $(el)
				.find("a")
				.text();
			if (idx > 0 && subCategoryName.indexOf("更多") === -1) {
				const subUrlPath = $(el)
					.find("a")
					.attr("href");
				subCategoryList.push({
					name: subCategoryName,
					url: `${MAIN_HOST}${subUrlPath}`,
				});
			}
		});

		categoryInfo.subCategoryList = subCategoryList;
		mainCategoryList[cIdx] = categoryInfo;
	}
	return mainCategoryList;
}

async function getOneCourseList(subCategoryObj) {
	let currentPage = 1;
	await page.goto(subCategoryObj.url);
	await page.waitFor(2000);
	console.log(`小類別 : ${subCategoryObj.name}`);
	console.log(`URL : ${subCategoryObj.url}`);

	$ = await getHtmlElementIntoCheerio("div.pagination-container");
	const totalPage = $("li.rc-pagination-item").length;

	const courseList = [];
	while (currentPage <= totalPage) {
		await page.goto(`${subCategoryObj.url}?page=${currentPage}`);
		await page.waitFor(1000);
		$ = await getHtmlElementIntoCheerio("div.list-container");

		$("div.hh-course-brief").each((cIdx, el) => {
			if ($(el).find("div.course-section").length === 1) {
				const courseName = $(el)
					.find("h4.title")
					.text();
				const coursePeople = $(el)
					.find("div.course-info > .pull-left")
					.find("span")
					.text();
				const coursePrice = $(el)
					.find("div.course-info > .pull-right")
					.find("span")
					.text();

				const courseInfo = {
					name: courseName,
					people: coursePeople,
					price: coursePrice,
				};

				courseList.push(courseInfo);
			}
		});
		currentPage++;
	}

	return courseList;
}

async function getHtmlElementIntoCheerio(selector) {
	const html = await page.$eval(selector, el => el.innerHTML);
	return cheerio.load(html, {decodeEntities: false});
}

async function exportCourseByCategory(categoryInfo) {
	const {categoryName: fileName, subCategoryList} = categoryInfo;
	const wb = XLSX.utils.book_new();
	for (let subCategoryObj of subCategoryList) {
		const courseListData = await getOneCourseList(subCategoryObj);
		console.log(courseListData);
		/* make the worksheet */
		const ws = XLSX.utils.json_to_sheet(courseListData);

		/* add to workbook */
		XLSX.utils.book_append_sheet(wb, ws, subCategoryObj.name);
	}
	/* generate an XLSX file */
	XLSX.writeFile(wb, `exportFiles/${fileName}.xlsx`);
}
